const Discord = require('discord.js');
const client = new Discord.Client();
const token = 'NDMwNDUxNzY2ODU4MDg4NDQ4.DaQZfA.Uqb_Xff-pjSq_e2B-ProzzXdpo4';
var async = require('async');
var mysql = require('mysql');
var https = require('https');
var fs = require('fs');
const path = require('path');

var dbdone = false;

var con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  multipleStatements: true
});

con.connect(function(err) {
  if (err) throw err;
  console.log("Connected!");
});

function qry(query, id) {
  con.query(query, function(err, result, fields) {
    //console.log(id)
    if (err) throw err;
    //console.log(result);
  });
}

function escapeqry(query, params) {
  con.query(query, params, function(err, result, fields) {
    if (err) throw err;
  });
}

function escapeqry2(query, params) {
  console.log("query: " + query);
  console.log("params: " + params);
  con.query(query, params, function(err, result, fields) {
    if (err) throw err;
    console.log(result);
  });
}

function download(file_savedest, url) { //https://stackoverflow.com/questions/10343951/http-get-loop-to-download-list-of-files/10343976
  https.get(url, function(res) {
    var imagedata = '';
    res.setEncoding('binary');

    res.on('data', function(chunk) {
      imagedata += chunk
    });

    res.on('end', function() {
      fs.writeFile(file_savedest, imagedata, 'binary', function(err) {
        if (err) {
          console.log(err);
        } else {
          console.log("File:" + file_savedest + " saved");
        }
      });
    });
  });
}

function createdb() {
  //Multiple statements query to ensure synchrony
  qry("CREATE DATABASE IF NOT EXISTS discordlog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  qry("USE discordlog");
  qry("CREATE TABLE IF NOT EXISTS guilds (GuildId bigint, Name nvarchar(102), Available boolean, PRIMARY KEY (GuildId))");
  qry("CREATE TABLE IF NOT EXISTS categories (CategoryId bigint, Name nvarchar(102), GuildId bigint, PRIMARY KEY (CategoryId), FOREIGN KEY (GuildId) REFERENCES guilds(GuildId))", 2);
  qry("CREATE TABLE IF NOT EXISTS channels (ChannelId bigint, Name nvarchar(102), Type varchar(10), CategoryId bigint, GuildId bigint, PRIMARY KEY (ChannelId), FOREIGN KEY (CategoryId) REFERENCES categories(CategoryId), FOREIGN KEY (GuildId) REFERENCES guilds(GuildId))", 3);
  qry("CREATE TABLE IF NOT EXISTS users (UserId bigint, Tag nvarchar(40), Bot boolean, AvatarUrl nvarchar(10000), AvatarPath nvarchar(500), Edited boolean, PRIMARY KEY (UserId))", 4);
  qry("CREATE TABLE IF NOT EXISTS dmchannels(DmChannelId bigint, UserId bigint, PRIMARY KEY(DmChannelId), FOREIGN KEY (UserId) REFERENCES users(UserId))", 5);
  qry("CREATE TABLE IF NOT EXISTS attachments(AttachmentId bigint, Path nvarchar(500), PRIMARY KEY (AttachmentId))", 6);
  qry("CREATE TABLE IF NOT EXISTS dms(DmId bigint, Content nvarchar(2010), Timestamp bigint, AttachmentId bigint, DmChannelId bigint, Edited boolean, PRIMARY KEY (DmId), FOREIGN KEY (DmChannelId) REFERENCES dmchannels (DmChannelId), FOREIGN KEY (AttachmentId) REFERENCES attachments(AttachmentId))", 7);
  qry("CREATE TABLE IF NOT EXISTS messages (MessageId bigint, UserId bigint, Content nvarchar(2010), Timestamp bigint, AttachmentId bigint, ChannelId bigint, Edited boolean, PRIMARY KEY (MessageId), FOREIGN KEY (UserId) REFERENCES users(UserId), FOREIGN KEY (AttachmentId) REFERENCES attachments(AttachmentId), FOREIGN KEY (ChannelId) REFERENCES channels(ChannelId))", 8);
  qry("CREATE TABLE IF NOT EXISTS messages_edits (MexEditId bigint NOT NULL AUTO_INCREMENT, OldContent nvarchar(2010), NewContent nvarchar(2010), Timestamp bigint, MessageId bigint, PRIMARY KEY (MexEditId), FOREIGN KEY (MessageId) REFERENCES messages(MessageId))");
  qry("CREATE TABLE IF NOT EXISTS dms_edits (DmEditId bigint NOT NULL AUTO_INCREMENT, OldContent nvarchar(2010), NewContent nvarchar(2010), Timestamp bigint, DmId bigint, PRIMARY KEY (DmEditId), FOREIGN KEY (DmId) REFERENCES dms(DmId))");
}

async function handleUsers(user, cb) {
  var avatarPath = path.resolve(__dirname, './avatars', user.id);
  async.series([
      function insert(cb) {
        con.query("INSERT INTO users (UserId , Tag, Bot, AvatarUrl, Edited) SELECT * FROM (SELECT ?, ?, ?, ?, 0 ) AS tmp WHERE NOT EXISTS (SELECT UserId FROM users WHERE UserId = ? ) LIMIT 1;", [user.id, user.tag, user.bot, user.displayAvatarURL, user.id], function(err, result, fields) {
          if (err) {
            cb(err);
          } else {
            cb(null, result);
          }
        });
      },
      function avatar(cb) {
        async.waterfall([
            function(cb) {
              con.query("SELECT AvatarUrl, AvatarPath FROM users WHERE UserId = ?", user.id, function(err, result, fields) {
                if (err) {
                  cb(err);
                } else {
                  var currentPath = result[0].AvatarPath;
                  var newPath;
                  if (currentPath === null) {
                    newPath = path.resolve(avatarPath + "-0000" + ".png");
                  } else if (result[0].AvatarUrl !== user.displayAvatarURL) {
                    newPath = path.resolve(avatarPath + "-" + ((parseInt((currentPath.substr(currentPath.length - 8)).substr(0, 4)) + 1).toString().padStart(4, "0")) + ".png");
                  } else {
                    newPath = "unchanged";
                  }
                  cb(null, newPath);
                }
              });
            },
            function(path, cb) {
              if (!(path === "unchanged")) {
                con.query("UPDATE users SET AvatarUrl = ?, AvatarPath = ? WHERE UserId = ?", [user.displayAvatarURL, path, user.id], function(err, result, fields) {
                  if (err) {
                    cb(err);
                  } else {
                    download(path, user.displayAvatarURL);
                    console.log("aggiornato");
                    cb(null, result);
                  }
                });
              } else {
                cb(null, 'unchanged');
              }
            }
          ],
          function donewithAvatar(err, result) {
            if (err) {
              cb(err);
            } else {
              cb(null, "doneWithAvatar");
            }
          });
      }
    ],
    function(err, result) {
      if (err) {
        cb(err);
      } else {
        cb(null, "doneWithUser");
      }
    });
}

function populatedb(cb) {
  async.parallel([
      function users(cb) {
        var users = client.users.array();
        async.each(users, function(user, cb) {
            handleUsers(user, function(err, result) {
              if (err) {
                cb(err);
              } else {
                cb(null, result);
              }
            });
          },
          function(err, result) {
            if (err) {
              cb(err);
            } else {
              //console.log("namama");
              cb(null, 'doneUsers');
            }
          });
      },
      function guilds(cb) {
        var guilds = client.guilds.array();
        async.each(guilds, function(guild, cb) {
            if (guild.available) {
              var tempid = guild.id;
              con.query("INSERT INTO guilds (GuildId, Name, Available) SELECT * FROM (SELECT ?, ?, 1 ) AS tmp WHERE NOT EXISTS (SELECT GuildId FROM guilds WHERE GuildId = ? ) LIMIT 1;", [tempid, guild.name, tempid], function(err, result, fields) {
                if (err) {
                  cb(err);
                } else {
                  cb(null, result);
                }
              });
            }
          },
          function doneGuilds(err, result) {
            if (err) {
              cb(err);
            } else {
              cb(null, 'doneGuilds');
            }
          });
      },
      function channels(cb) {
        var channels = client.channels.array();
        async.each(channels, function(channel, cb) {
            if (channel.type === 'category') {
              con.query("INSERT INTO categories (CategoryId, Name, GuildId) SELECT * FROM (SELECT ?, ?, ? ) AS tmp WHERE NOT EXISTS (SELECT CategoryId FROM categories WHERE CategoryId = ? ) LIMIT 1;", [channel.id, channel.name, channel.guild.id, channel.id], function(err, result, fields) {
                if (err) {
                  cb(err);
                } else {
                  cb(null, result);
                }
              });
            } else if (channel.type === 'dm') {
              con.query("INSERT INTO dmchannels (DmId, UserId) SELECT * FROM (SELECT ?, ? ) AS tmp WHERE NOT EXISTS (SELECT DmId FROM dmchannels WHERE DmId = ? ) LIMIT 1;", [channel.id, channel.recipient.id], function(err, result, fields) {
                if (err) {
                  cb(err);
                } else {
                  cb(null, result);
                }
              });
            } else {
              con.query("INSERT INTO channels (ChannelId, Name, Type, CategoryId, GuildId) SELECT * FROM (SELECT ?, ?, ?, ?, ? ) AS tmp WHERE NOT EXISTS (SELECT ChannelId FROM channels WHERE ChannelId = ? ) LIMIT 1;", [channel.id, channel.name, channel.type, channel.parentID, channel.guild.id, channel.id], function(err, result, fields) {
                if (err) {
                  cb(err);
                } else {
                  cb(null, result);
                }
              });
            }
          },
          function doneChannels(err, result) {
            if (err) {
              cb(err);
            } else {
              cb(null, 'doneChannels');
            }
          });
      }
    ],
    function donewithParallel(err, result) {
      if (err) {
        cb(err);
      } else {
        console.log(result);
        cb(null, result);
      }
    });
}

function processMsg(msg, cb) {
  /*IF MESSAGE HAS AN ATTACHMENT*/
  if (msg.attachments.array().length > 0) {
    var filenameext = msg.attachments.first().filename;
    var n = filenameext.lastIndexOf(".");
    var attachPath = path.resolve(__dirname, './attachments', (filenameext.substring(0, n) + "-" + msg.attachments.first().id.toString() + filenameext.substring(n)));
    console.log(attachPath);
    download(attachPath, msg.attachments.first().url);
    if (msg.channel.type === 'text') {
      con.query("INSERT INTO attachments (AttachmentId, Path) VALUES (?, ?); INSERT INTO messages (MessageId, UserId, Content, Timestamp, AttachmentId, ChannelId ) VALUES (?, ?, ?, ?, ?, ?) ", [msg.attachments.first().id, attachPath, msg.id, msg.author.id, msg.cleanContent, msg.createdTimestamp, msg.attachments.first().id, msg.channel.id], function(err, result, fields) {
        if (err) {
          cb(err);
        } else {
          cb(null, 'doneWithAttachText');
        }
      });
    } else if (msg.channel.type === 'dm') {
      async.series([
          function(cb) {
            handleUsers(msg.channel.recipient, function(err, result) {
              if (err) {
                cb(err);
              } else {
                cb(null, result);
              }
            });
          },
          function(cb) {
            con.query("INSERT INTO attachments (AttachmentId, Path) VALUES (?, ?); INSERT INTO dmchannels (DmChannelId, UserId) SELECT * FROM (SELECT ?, ?) AS tmp WHERE NOT EXISTS (SELECT DmChannelId FROM dmchannels WHERE DmChannelId = ? ) LIMIT 1; INSERT INTO dms (DmId, Content, Timestamp, AttachmentId, DmChannelId ) VALUES (?, ?, ?, ?, ?)", [msg.attachments.first().id, attachPath, msg.channel.id, msg.channel.recipient.id, msg.channel.id, msg.id, msg.cleanContent, msg.createdTimestamp, msg.attachments.first().id, msg.channel.id],
              function(err, result, fields) {
                if (err) {
                  cb(err);
                } else {
                  cb(null, result);
                }
              });
          }
        ],
        function doneWithAttachDm(err, result) {
          if (err) {
            cb(err);
          } else {
            cb(null, 'doneWithAttachDm');
          }
        }
      );
    }
  }
  /*IF MESSAGE DOESN'T HAVE AN ATTACHMENT*/
  else {
    if (msg.channel.type === 'text') {
      con.query("INSERT INTO messages (MessageId, UserId, Content, Timestamp, ChannelId ) VALUES (?, ?, ?, ?, ?)", [msg.id, msg.author.id, msg.cleanContent, msg.createdTimestamp, msg.channel.id], function(err, result, fields) {
        if (err) {
          cb(err);
        } else {
          cb(null, 'doneWithMexText');
        }
      });
    } else if (msg.channel.type === 'dm') {
      async.series([
          function(cb) {
            handleUsers(msg.channel.recipient, function(err, result) {
              if (err) {
                cb(err);
              } else {
                cb(null, result);
              }
            });
          },
          function(cb) {
            con.query("INSERT INTO dmchannels (DmChannelId, UserId) SELECT * FROM (SELECT ?, ?) AS tmp WHERE NOT EXISTS (SELECT DmChannelId FROM dmchannels WHERE DmChannelId = ? ) LIMIT 1; INSERT INTO dms (DmId, Content, Timestamp, DmChannelId ) VALUES (?, ?, ?, ?)", [msg.channel.id, msg.channel.recipient.id, msg.channel.id, msg.id, msg.cleanContent, msg.createdTimestamp, msg.channel.id],
              function(err, result, fields) {
                if (err) {
                  cb(err);
                } else {
                  cb(null, result);
                }
              });
          }
        ],
        function doneWithMexDm(err, result) {
          if (err) {
            cb(err);
          } else {
            cb(null, 'doneWithMexDm');
          }
        }
      );
    }
  }
}

function updateMessage(oldmsg, newmsg, cb) {
  if (newmsg.channel.type === 'text') {
    async.parallel([
        function updateMex(cb) {
          con.query("UPDATE messages SET Content = ?, Edited = 1 WHERE MessageId = ?", [newmsg.cleanContent, oldmsg.id], function(err, result, fields) {
            if (err) {
              cb(err);
            } else {
              cb(null, 'doneWithUpdateMex');
            }
          });
        },
        function logMexChanges(cb) {
          con.query("INSERT INTO messages_edits (OldContent, NewContent, Timestamp, MessageId ) VALUES (?, ?, ?, ?)", [oldmsg.cleanContent, newmsg.cleanContent, newmsg.editedTimestamp, newmsg.id], function(err, result, fields) {
            if (err) {
              cb(err);
            } else {
              cb(null, 'doneWithLogMexChanges');
            }
          });
        }
      ],
      function doneWithMexUpdate(err, result) {
        if (err) {
          cb(err);
        } else {
          cb(null, result);
        }
      });
  } else if (newmsg.channel.type === 'dm') {
    async.parallel([
        function updateDm(cb) {
          con.query("UPDATE dms SET Content = ?, Edited = 1 WHERE DmId = ?", [newmsg.cleanContent, oldmsg.id], function(err, result, fields) {
            if (err) {
              cb(err);
            } else {
              cb(null, 'doneWithUpdateDm');
            }
          });
        },
        function logDmChanges(cb) {
          con.query("INSERT INTO dms_edits (OldContent, NewContent, Timestamp, DmId ) VALUES (?, ?, ?, ?)", [oldmsg.cleanContent, newmsg.cleanContent, newmsg.editedTimestamp, newmsg.id], function(err, result, fields) {
            if (err) {
              cb(err);
            } else {
              cb(null, 'doneWithLogDmChanges');
            }
          });
        }
      ],
      function doneWithDmUpdate(err, result) {
        if (err) {
          cb(err);
        } else {
          cb(null, result);
        }
      });
  }
}
/* TODO:
-Se Gabri manda più di x messaggi più corti di y lettere in z tempo,  KICK ABBUSO PORKADDIO;
-Chat Log;
-Se spacy dice forse, spam di @spacy DECIDITI!
-Citazioni;
-Memebot per Spacy, priority -1;
- Auto add song playlist yt
-Bestemmie;
*/

if (!fs.existsSync(path.resolve(__dirname, './avatars'))) {
  fs.mkdirSync(path.resolve(__dirname, './avatars'));
}
if (!fs.existsSync(path.resolve(__dirname, './attachments'))) {
  fs.mkdirSync(path.resolve(__dirname, './attachments'));
}

createdb();

/*EVENTS TO HANDLE
  channelCreate
  channelDelete
  channelUpdate ----
  guildCreate
  guildDelete
  guildMemberAdd
  guildUpdate ----
  guildMemberUpdate ???
  guildUpdate ----
  message
  messageDelete
  messageDeleteBulk
  messageUpdate
  ready
  resume
  userUpdate ???
*/

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  populatedb(function(err, result) {
    dbdone = true;
  });
});

client.on('message', msg => {
  if (dbdone) {
    console.log(msg.content);
    processMsg(msg, function(err, result) {
      console.log(result);
    });
  } else {
    console.log("DB not ready");
  }
});

client.on('messageUpdate', function(oldmsg, newmsg) {
  if (dbdone) {
    updateMessage(oldmsg, newmsg, function(err, result) {
      console.log(result);
    });
  }
});

client.on('channelUpdate', function(oldmsg, newmsg) {
  console.log("Fired channelUpdate");
});

client.on('guildMemberAdd', function(oldmsg, newmsg) {
  console.log("Fired guildMemberAdd");
});

client.on('guildMemberUpdate', function(oldmsg, newmsg) {
  console.log("Fired guildMemberUpdate");
});

client.on('userUpdate', function(oldmsg, newmsg) {
  console.log("Fired userUpdate");
});

client.login(token);
