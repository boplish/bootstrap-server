/** @fileOverview Boostrap functionality */

var WebSocketServer = require('websocket').server;
var http = require('http');
var fs = require('fs');
var logger = require('winston');

/**
 * @constructor
 * @param port {Number} Port this server shall listen on
 */
BootstrapServer = function(hostname, port, staticPath) {
    if (!(this instanceof BootstrapServer)) {
        return new BootstrapServer();
    }
    this._hostname = hostname || 'localhost';
    this._port = port || 3000;
    this._staticPath = staticPath || __dirname + '/';
    this._users = {};
    this._httpServer = null;
    this._websocketServer = null;
    this._rttStream = fs.createWriteStream("rtt.dat", {
        flags: 'a'
    });
    return this;
};

BootstrapServer.prototype = {
    /**
     * Start listening
     *
     * @param successCallback {Function} Gets called when the http server is listening
     */
    listen: function(successCallback) {
        this._httpServer = http.createServer(this._onHttpRequest.bind(this));
        this._httpServer.listen(this._port, this._hostname, successCallback);
        this._websocketServer = new WebSocketServer({
            httpServer: this._httpServer,
            autoAcceptConnections: false
        });
        this._websocketServer.on('request', this._onWebSocketRequest.bind(this));
        logger.info('BootstrapServer listening on ' + this._hostname + ':' + this._port + ', serving from ' + this._staticPath);
    },

    /**
     * Gets called on a HTTP Request to this server (serving static files)
     *
     * @param request {http.IncomingMessage}
     * @param response {http.ServerResponse}
     */
    _onHttpRequest: function(request, response) {
        logger.info('Received HTTP request for ' + request.url);

        try {
            response.writeHead(200);
            if (request.url === '/') {
                response.write(fs.readFileSync(this._staticPath + '/index.html'));
            } else {
                response.write(fs.readFileSync(this._staticPath + request.url));
            }
        } catch (e) {
            response.writeHead(200);
            response.write('<p>This is a BOPlish Bootstrap Server - <a href="//github.com/boplish">github.com/boplish</a>');
        }
        response.end();
    },

    /**
     * Gets called when a client initiates a WebSocket connection
     * to the server. Associates the initiated connection with a peerId
     * given in the initial connection URI (as 12345 in ws://localhost/ws/12345)
     *
     * @param request {WebSocketRequest}
     */
    _onWebSocketRequest: function(request) {
        var conn;
        var url = request.httpRequest.url;
        var peerId;
        if (url.substr(0, 13) === '/rttcollector') {
            this._onRTTCollectorRequest(request);
            return;
        }
        peerId = url.substr(4);
        if (!peerId || url.substr(0, 4) !== '/ws/') {
            request.reject('404', 'malformed request');
            logger.info('Discarding Request because of malformed uri ' + request.httpRequest.url);
            return;
        }
        logger.info('Received WS request from PeerId ' + peerId);
        conn = request.accept(null, request.origin);
        conn.on('close', this._onWebSocketClose.bind(this, peerId));
        conn.on('message', this._onWebSocketMessage.bind(this));
        this._users[peerId] = conn;
    },

    _onRTTCollectorRequest: function(request) {
        var conn;
        logger.info('Received WS RTT collector request');
        conn = request.accept(null, request.origin);
        conn.on('message', function(msg) {
            this._rttStream.write(msg.utf8Data + "\n", 'utf-8');
        }.bind(this));
    },

    /**
     * Gets called whenever a peer sends a message over its websocket connection
     *
     * @param rawMsg {String} incoming UTF8-String containing the message
     */
    _onWebSocketMessage: function(rawMsg) {
        var msg;
        try {
            msg = JSON.parse(rawMsg.utf8Data);
        } catch (e) {
            logger.info('Could not parse incoming message: ' + rawMsg.utf8Data + ' ' + e);
            return;
        }
        if (msg.to === 'signaling-server') {
            logger.debug("message for me, ignoring", msg);
            return;
        }
        if (msg.to !== "*") {
            logger.debug("forwarding", msg);
            try {
                this._users[msg.to].send(JSON.stringify(msg));
            } catch (e) {
                logger.info("Could not forward", e);
                this._users[msg.from].send(JSON.stringify({
                    type: 'ERROR',
                    seqnr: msg.seqnr,
                    error: "Could not forward message"
                }));
            }
            return;
        }
        if (typeof(msg.payload) === 'undefined' || msg.payload === null) {
            logger.debug('Discarding message: ' + JSON.stringify(msg) + ' because it does not carry any payload');
            return;
        }
        if (msg.payload.type === "signaling-protocol") {
            switch (msg.payload.payload.type) {
                case 'offer':
                    this._handleOffer(msg);
                    break;
                case 'answer':
                    this._handleAnswer(msg);
                    break;
                default:
                    logger.debug('Discarding message: ' + JSON.stringify(msg) + ' because the type is unknown');
            }
        }
    },

    _ack: function(msg) {
        logger.debug("ACKing", msg);
        try {
            this._users[msg.from].send(JSON.stringify({
                type: 'ACK',
                seqnr: msg.seqnr,
                to: msg.from,
                from: 'signaling-server'
            }));
        } catch (e) {
            logger.info("Could not ACK", e);
        }
    },

    /**
     * Forwards an offer to a connected peer via its WebSocket
     * connection. The peer is chosen at random if not explicitly
     * set in the message's `to` field
     *
     * @param msg {Object} The message containing the offer
     */
    _handleOffer: function(msg) {
        var receiver;
        if (Object.keys(this._users).length <= 1) {
            // denied (i.e. this is the first connecting peer)
            this._ack(msg);
            logger.debug('denying', msg);
            this._users[msg.from].send(JSON.stringify({
                type: 'ROUTE',
                to: msg.from,
                from: 'signaling-server',
                seqnr: Math.floor(Math.random() * 1000000),
                payload: {
                    type: 'signaling-protocol',
                    to: msg.from,
                    from: 'signaling-server',
                    seqnr: msg.payload.seqnr,
                    payload: {
                        type: 'denied'
                    }
                }
            }));
            return;
        }
        if (this._users[msg.to]) {
            // receiver known
            receiver = this._users[msg.to];
        } else if (msg.to === '*') {
            // random receiver (inital offer)
            while (true) {
                var keys = Object.keys(this._users);
                var candidate = keys[keys.length * Math.random() << 0];
                if (candidate !== msg.from) {
                    logger.debug('Sending offer from: ' + msg.from + ' to: ' + candidate);
                    msg.to = candidate;
                    receiver = this._users[candidate];
                    break;
                }
            }
        } else {
            logger.info((new Date()) + ' Could not handle offer because the message is malformed');
            return;
        }
        try {
            logger.debug("sending", msg);
            receiver.send(JSON.stringify(msg));
        } catch (e) {
            logger.info('Could not send offer to ' + msg.to + ' because the WebSocket connection failed: ' + e);
        }
    },

    /**
     * Forwards an answer to the corresponding peer (set in the `msg.to` field
     * from the client).
     *
     * @param msg {Object} The message containing the answer
     */
    _handleAnswer: function(msg) {
        var receiver = this._users[msg.to];
        try {
            logger.debug('Sending answer from: ' + msg.from + ' to: ' + msg.to);
            this._users[msg.to].send(JSON.stringify(msg));
        } catch (e) {
            logger.info('Could not send offer to ' + msg.to + ' because the WebSocket connection failed: ' + e);
        }
    },

    /**
     * Removes a peer from the user table when the WebSocket closes
     *
     * @param peerId {String} The ID of the disconnected peer
     * @param reasonCode {Object} (unused) Reason code for disconnect
     * @param description {Object} (unused) Description for disconnect
     */
    _onWebSocketClose: function(peerId, reasonCode, description) {
        logger.info('Removing user: ' + peerId);
        delete this._users[peerId];
    },

    /**
     *
     *
     */
    close: function() {
        this._websocketServer.shutDown();
        this._httpServer.close();
    }
};

if (typeof(module) !== 'undefined') {
    module.exports = BootstrapServer;
}
