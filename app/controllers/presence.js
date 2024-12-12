'use strict';

var util = require('util'),
    Connection = require('./../core/presence').Connection;

function SocketIoConnection(user, socket) {
    Connection.call(this, 'socket.io', user);
    this.socket = socket;
    socket.conn = this;
    socket.on('disconnect', this.disconnect.bind(this));
}

util.inherits(SocketIoConnection, Connection);

SocketIoConnection.prototype.disconnect = function() {
    this.emit('disconnect');

    this.socket.conn = null;
    this.socket = null;
};

module.exports = function() {
    var app = this.app,
        core = this.core,
        User = this.models.user;

    app.io.on('connection', async function(socket) {
        var userId = socket.request.user._id;

        const user = await User.findById(userId);
        if (!user) {
            console.error("Không tìm thấy user");
            return;
        }
        var conn = new SocketIoConnection(user, socket);
        core.presence.connect(conn);

    });
};
