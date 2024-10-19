const express = require('express');
const router = express.Router();
const fdb = require('../libs/firebase_db').fdb;

function isAuthenticated(req, res, next) {
    req.session.role = 'admin'
    
    // if (!req.session.isAuthenticated) {
    //     return res.redirect('login'); // redirect to sign-in route
    // }
    next();
};

router.get('/', isAuthenticated, (req, res, next) => {
    res.render('index', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});

router.get('/login', (req, res) => {
    res.render('login', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});

router.get('/test', (req, res) => {
    res.render('test', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});

router.get('/speaking', (req, res) => {
    res.render('speaking', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});

router.get('/writing', (req, res) => {
    res.render('writing', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});

router.get('/reading', (req, res) => {
    res.render('reading', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});

router.get('/listening', (req, res) => {
    res.render('listening', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});

router.get('/reading/tfng', (req, res) => {
    res.render('reading_tfng', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});

router.get('/advisory', (req, res) => {
    res.render('advisory', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});

router.get('/profile', (req, res) => {
    res.render('profile', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});



router.post('/', (req,res)=>{
    var r = {r:0};
    var action = req.body.action;
    
    if(action == 'changeLanguage'){
        const language = req.body.language;
        res.cookie("language", language);
        r['r'] = 1;
        res.send(JSON.stringify(r));
    }
});


module.exports = router;