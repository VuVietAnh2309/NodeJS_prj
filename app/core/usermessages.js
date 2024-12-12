'use strict';

var _ = require('lodash'),
    mongoose = require('mongoose'),
    helpers = require('./helpers');

function UserMessageManager(options) {
    this.core = options.core;
}

// options.currentUser, options.user

UserMessageManager.prototype.onMessageCreated = async function(message, user, options, cb) {
    var User = mongoose.model('User');

    const owner = User.findOne(message.owner);
    if (!owner) {
        console.error("Không tìm thấy owner");
        return cb("Không tìm thấy owner");
    }
    if (cb) {
        cb(null, message, user, owner);
    }

    this.core.emit('user-messages:new', message, user, owner, options.data);
};

UserMessageManager.prototype.create = async function(options, cb) {
    var UserMessage = mongoose.model('UserMessage'),
        User = mongoose.model('User');

    const user = await User.findById(options.user);    
    if (!user) {
        return cb('User does not exist.');
    }

    var data = {
        users: [options.owner, options.user],
        owner: options.owner,
        text: options.text
    };

    var message = new UserMessage(data);

    // Test if this message is OTR
    if (data.text.match(/^\?OTR/)) {
        message._id = 'OTR';
        this.onMessageCreated(message, user, options, cb);
    } else {
        await message.save(function(err) {
            if (err) {
                console.error(err);
                return cb(err);
            }
            this.onMessageCreated(message, user, options, cb);
        }.bind(this));
    }

    // User.findById(options.user, async function(err, user) {
    //     if (err) {
    //         console.error(err);
    //         return cb(err);
    //     }
        
    // }.bind(this));
};

UserMessageManager.prototype.list = async function(options, cb) {
    options = options || {};

    if (!options.room) {
        return cb(null, []);
    }

    options = helpers.sanitizeQuery(options, {
        defaults: {
            reverse: true,
            take: 500
        },
        maxTake: 5000
    });

    var UserMessage = mongoose.model('Message');

    var find = UserMessage.find({
        users: { $all: [options.currentUser, options.user] }
    });

    if (options.since_id) {
        find.where('_id').gt(options.since_id);
    }

    if (options.from) {
        find.where('posted').gt(options.from);
    }

    if (options.to) {
        find.where('posted').lte(options.to);
    }

    if (options.expand) {
        var includes = options.expand.split(',');

        if (_.includes(includes, 'owner')) {
            find.populate('owner', 'id username displayName email avatar');
        }
    }

    if (options.skip) {
        find.skip(options.skip);
    }

    if (options.reverse) {
        find.sort({ 'posted': -1 });
    } else {
        find.sort({ 'posted': 1 });
    }

    const messages = await find.limit(options.take)
        .exec();
    if (!messages) {
        console.error("Danh sách messages rỗng");
        return cb("Danh sách messages rỗng");
    }
    cb(null, messages);
};

module.exports = UserMessageManager;
