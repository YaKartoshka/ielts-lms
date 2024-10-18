const express = require('express');
const router = express.Router();
const { fdb } = require("../libs/firebase_db");

function isAuthenticated(req, res, next) {
    if (!req.session.isAuthenticated) {
        return res.send('Unauthorized access'); // redirect to sign-in route
    }
    next();
};


router.post('/create', isAuthenticated, async (req, res) => {
    var r = { r: 0 };
    const { repetition, event_name, time, event_date, week_day, coach_id, coach_name } = req.body;
    console.log(req.body)
    if (!repetition || !event_name || !time || !coach_id) {
        return res.status(400).send('All fields are required.');
    }

    await fdb.collection('panels').doc(req.session.panel_id).collection('events').add({
        repetition: repetition,
        event_name: event_name,
        time: time,
        event_date: event_date,
        week_day: week_day,
        coach_id: coach_id,
        coach_name: coach_name,
        members: '[]'
    }).then(() => {
        r['r'] = 1;
        res.send(JSON.stringify(r));
    }).catch((e) => {
        console.log(e)
        res.send(JSON.stringify(r));
    })
});

router.post('/edit', isAuthenticated, async (req, res) => {
    var r = { r: 0 };
    const { event_id, event_name, time, week_day, coach_id, coach_name } = req.body;

    if (!week_day || !event_name || !time || !coach_id || !coach_name) {
        return res.status(400).send('All fields are required.');
    }

    await fdb.collection('panels').doc(req.session.panel_id).collection('events').doc(event_id).update({
        event_name: event_name,
        time: time,
        week_day: week_day,
        coach_id: coach_id,
        coach_name: coach_name,
        members: '[]'
    }).then(() => {
        r['r'] = 1;
        res.send(JSON.stringify(r));
    }).catch((e) => {
        console.log(e);
        res.send(JSON.stringify(r));
    });
});

router.post('/delete', isAuthenticated, async (req, res) => {
    var r = { r: 0 };
    const { event_id } = req.body;

    if (!event_id) {
        return res.send(JSON.stringify(r));
    }

    await fdb.collection('panels').doc(req.session.panel_id).collection('events').doc(event_id).delete().then(() => {
        r['r'] = 1;
        res.send(JSON.stringify(r));
    }).catch((e) => {
        console.log(e)
        res.send(JSON.stringify(r));
    })
});

router.get('/get', isAuthenticated, async (req, res) => {
    var data = [];
    const panel_id = req.session.panel_id;
    const events = await fdb.collection('panels').doc(panel_id).collection('events').get();
    events.docs.forEach((event) => {
        data.push({ ...event.data(), event_id: event.id });
    })
    res.send(data);
});

router.post('/members/update', async (req, res) => {
    var r = {r:0};
    const members = req.body.members;
    const event_id = req.body.event_id;

    await fdb.collection('panels').doc(req.session.panel_id).collection('events').doc(event_id).update({
        members: members
    }).then(() => {
        r['r'] = 1;
        res.send(JSON.stringify(r));
    }).catch((e) => {
        console.log(e);
        res.send(JSON.stringify(r));
    });
})





module.exports = router;