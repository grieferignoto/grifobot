//backup

//console.log("banana " + users);
for (var i = 0, userlen = users.length; i < userlen; i++) {
  var userId = users[i].id;
  var avatarPath = path.resolve(__dirname, './avatars', userId);
  var avatarUrl = users[i].displayAvatarURL;


//escapeqry("INSERT INTO users (UserId , Tag, Bot, AvatarUrl, AvatarPath, Edited) SELECT * FROM (SELECT ?, ?, ?, ?, ?, 0 ) AS tmp WHERE NOT EXISTS (SELECT UserId FROM users WHERE UserId = ? ) LIMIT 1;", [userId, users[i].tag, users[i].bot, avatarUrl, avatarPath + "-0000.png", userId]);
con.query("INSERT INTO users (UserId , Tag, Bot, AvatarUrl, Edited) SELECT * FROM (SELECT ?, ?, ?, ?, 0 ) AS tmp WHERE NOT EXISTS (SELECT UserId FROM users WHERE UserId = ? ) LIMIT 1;", [userId, users[i].tag, users[i].bot, avatarUrl, userId], function(err, result, fields) {
  if (err) throw err;
  con.query("SELECT AvatarUrl, AvatarPath FROM users WHERE UserId = ?", userId, function(err, result, fields) {
    if (err) throw err;
    console.log(result);
    var currentPath = result[0].AvatarPath;
    var newPath;
    if (currentPath === null) {
      console.log("sono entrato perchè server = " + result[0].AvatarUrl + " e db = " + avatarUrl + "e userid" + userId);
      newPath = path.resolve(avatarPath + "-0000" + ".png");
    } else if (result[0].AvatarUrl !== avatarUrl) {
      console.log("sono entrato perchè server = " + result[0].AvatarUrl + " e db = " + avatarUrl + "e userid" + userId);
      //escapeqry("UPDATE users SET AvatarUrl = ?, AvatarPath = ? WHERE UserId = ?", [avatarUrl, ] )
      newPath = path.resolve(avatarPath + (((currentPath.substr(currentPath.length - 8, currentPath.length - 4)) + 1)).toString().padStart(4, "0") + ".png");
      console.log(avatarUrl + newPath + userId);
      //download(path.resolve(avatarPath + "-0.png"), avatarUrl);
    }
    con.query("UPDATE users SET AvatarUrl = ?, AvatarPath = ? WHERE UserId = ?", [avatarUrl, newPath, userId], function(err, result, fields) {
      if (err) throw err;
    });
  });
});
