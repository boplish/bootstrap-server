[![Build Status](https://travis-ci.org/boplish/bootstrap-server.svg?branch=master)](https://travis-ci.org/boplish/bootstrap-server)

Node.js BOPlish Signaling Server
================================

This is a simple implementation of a signaling server needed by BOPlish applications for
joining the P2P network.

Requirements
============

* node.js
* npm

Usage
=====

From inside this directory issue the following commands:

    $ npm install
    $ chmod +x run.js
    $ ./run.js -b 0.0.0.0 -p 5000 -d /var/www/

The server is now up serving bootstrap WebSocket connections on port 5000 and
static files from `/var/www/`. You can run unit-tests by issuing

    $ npm test

For deploying the [BOPlish demos](https://github.com/boplish/demos/) to this
server just clone the demos repo and point the bootstrap server to the folder on
your local file system instead of `/var/www/` using the `-d` flag.

When the server is running you'll be able to run the demos by pointing your
browser to 
[http://localhost:5000/current](http://localhost:5000/current).
