#!/usr/bin/env node

/**
 * Module dependencies
 */
var winston = require('winston');
var BootstrapServer = require('./bootstrapserver.js');
var program = require('commander');

/** 
 * Module configuration
 */
winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, {'timestamp': true, 'colorize': true});
program
    .version('0.0.2')
    .option('-b, --bind <ip>', 'Bind address', String, '127.0.0.1')
    .option('-p, --port <port>', 'Listen port', Number, 5000)
    .option('-d, --directory <directory>', 'Directory to serve content from', String, './static/')
    .parse(process.argv);

var server = new BootstrapServer(program.bind, program.port, program.directory);
server.listen();
