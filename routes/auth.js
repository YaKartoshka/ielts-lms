const express = require("express");
const router = express.Router();
const async = require("async");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const firebase = require("../libs/firebase_db");
var r = { "r": 200 };

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

passport.use(
  "google_sign_in",
  new GoogleStrategy(
    {
      clientID: conf.google.clientID,
      clientSecret: conf.google.clientSecret,
      callbackURL: run_mode == 2 ? "https://coachmate.kz/auth/google_sign_in/index" : "http://localhost:4000/auth/google_sign_in/index",
      passReqToCallback: true,
    },
    function (request, accessToken, refreshToken, profile, done) {
      return done(null, profile);
    }
  )
);

passport.use(
  "google_sign_up",
  new GoogleStrategy(
    {
      clientID: conf.google.clientID,
      clientSecret: conf.google.clientSecret,
      callbackURL: run_mode == 2 ? "https://coachmate.kz/auth/google_sign_up/index" : "http://localhost:4000/auth/google_sign_up/index",
      scope: ["email", "profile"],
      passReqToCallback: true,
    },
    function (request, accessToken, refreshToken, profile, done) {
      return done(null, profile);
    }
  )
);

/* ---- Basic Auth ----    */

router.post("/sign-in", async (req, res) => {
  const email = req.body.email.toLowerCase().trim();
  const password = req.body.password.trim();

  firebase.fauth.signInWithEmailAndPassword(firebase.fauth.getAuth(), email, password).then(async (userCredential) => {
    const user_id = userCredential.user.uid;

    var documentFound = false;
    const panels = await firebase.fdb.collection('panels').get();
    const panel_promises = panels.docs.map(async (panel) => {
      if (!documentFound) {
        let user = await firebase.fdb.collection('panels').doc(panel.id).collection('users').doc(user_id).get();
        if (user.exists) {
          r['r'] = 1;
          documentFound = true;
          req.session.user_id = user_id;
          req.session.isAuthenticated = true;
          req.session.panel_id = panel.id;
          req.session.panel_name = panel.data().panel_name;
          req.session.role = user.data().role;
          res.send(JSON.stringify(r));
        }
      }
    });

    await Promise.all(panel_promises);

    if (!documentFound) {
      r['r'] = 3;
      res.send(JSON.stringify(r));
    }

  }, (err) => {
    console.log(err.code);
    if (err.code == 'auth/user-not-found') {
      r['r'] = 2;
    } else if (err.code == 'auth/wrong-password') {
      r['r'] = 0;
    } else if (err.code == 'auth/too-many-requests') {
      r['r'] = 3;
    }
    res.send(JSON.stringify(r));
  });
});

router.post("/sign-up", async (req, res) => {
  const email = req.body.email.toLowerCase().trim();
  const password = req.body.password.trim();

  firebase.fauth.createUserWithEmailAndPassword(firebase.fauth.getAuth(), email, password).then(async (userCredential) => {
    const user_id = userCredential.user.uid;

    const panels = firebase.fdb.collection('panels');
    const new_panel = await panels.add({
      panel_name: 'Default'
    });

    req.session.user_id = user_id;
    req.session.isAuthenticated = true;
    req.session.panel_id = new_panel.id;
    req.session.panel_name = panel.data().panel_name;
    req.session.role = 'admin';

    const new_user = await panels.doc(new_panel.id).collection('users').doc(user_id).set({
      user_id: user_id,
      email: email,
      role: 'admin',
      first_name: 'Admin',
      last_name: null,
      profile_img: null,
      phone_number: null,
      description: null
    });

    r['r'] = 1;
    res.send(JSON.stringify(r));

  }, (err) => {
    if (err.code == 'auth/email-already-in-use') {
      r['r'] = 4;
    }
    res.send(JSON.stringify(r));
  });
});


/* ---- Google Auth ----    */

router.get(
  "/google_sign_in",
  passport.authenticate("google_sign_in", { scope: ["profile", "email"] }, () => { })
);

router.get(
  "/google_sign_in/index",
  passport.authenticate("google_sign_in", { failureRedirect: "/login?status=0", }),
  async function (req, res) {
    const google_id = req.user.id;
    var documentFound = false;
    const panels = await firebase.fdb.collection('panels').get();
    const panel_promises = panels.docs.map(async (panel) => {
      if (!documentFound) {
        await firebase.fdb.collection('panels').doc(panel.id).collection('users').where('google_id', '==', google_id).get().then((users)=>{
          
          users.docs.map((user)=>{
            if (user.exists) {
              r['r'] = 1;
              documentFound = true;
              req.session.user_id = user.id;
              req.session.isAuthenticated = true;
              req.session.panel_id = panel.id;
              req.session.panel_name = panel.data().panel_name;
              req.session.role = user.data().role;
              res.redirect('/');
            }
          });
        });
      }
    });

    await Promise.all(panel_promises);

    if (!documentFound) {
      res.redirect('/login?status=0');
    }
  }
);

router.get(
  "/google_sign_up",
  passport.authenticate("google_sign_up", { scope: ["profile", "email"] }, () => { })
);

router.get(
  "/google_sign_up/index",
  passport.authenticate("google_sign_up", { failureRedirect: "/login?status=1" }),
  async function (req, res) {
    const google_id = req.user.id;
    const email = req.user.emails[0].value;


    firebase.fauth.createUserWithEmailAndPassword(firebase.fauth.getAuth(), email, "googlet7r2j689").then(async (userCredential) => {
      const user_id = userCredential.user.uid;
      const panels = firebase.fdb.collection('panels');
      const new_panel = await panels.add({
        panel_name: 'Default'
      });

      req.session.panel_id = new_panel.id;
      const new_user = await panels.doc(new_panel.id).collection('users').doc(user_id).set({
        user_id: user_id,
        google_id: google_id,
        email: email,
        role: 'admin',
        first_name: 'Admin',
        last_name: null,
        profile_img: null,
        phone_number: null,
        description: null
      });


      req.session.user_id = user_id;
      req.session.role = 'admin';
      req.session.panel_name = 'Default'
      req.session.isAuthenticated = true;
      res.redirect('/');
    }, (err) => {
      if (err.code == 'auth/email-already-in-use') {
        res.redirect('/login?status=1')
      }
    });
  }
);

router.get('/logout', (req, res) => {
  req.session.destroy();
  return res.redirect('/login');
});

/* ---- End Google Auth ----    */

module.exports = router;
