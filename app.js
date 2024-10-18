var express = require('express');
var fs = require('fs');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var app = express();
var passport = require('passport');

// -------- routes --------
var index = require('./routes/index');
var auth = require('./routes/auth');
var speaking = require('./routes/speaking');
var writing = require('./routes/writing');
require('./libs/translate')
//html ejs
app.set('views', path.join(__dirname, 'views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');


// -- used packages --
app.use(bodyParser.json({ limit: '500mb' }));
app.use(bodyParser.urlencoded({ limit: '500mb', extended: true }));
app.use(cookieParser());
app.use("/public/css", express.static(__dirname + "/public/css"));
app.use("/js", express.static(__dirname + "/public"));
app.use("/public", express.static(__dirname + "/public"));
app.set("trust proxy", true);
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: "coachmate-token-123-t7r2j689",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // set this to true on production
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// -- routes --
app.use('/', index);
app.use('/auth', auth);
app.use('/speaking', speaking);
app.use('/writing', writing);



app.use((req, res, next) => {
    res.status(404).render('error', {L:L, language: req.cookies.language ? req.cookies.language : 'en' })
});

module.exports = app;

