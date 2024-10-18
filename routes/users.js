const express = require('express');
const validator = require('validator');
const router = express.Router();
const { fdb, admin_fauth } = require("../libs/firebase_db");
var Json2csvParser = require('json2csv').Parser;
const fs = require('fs');

router.post('/create', async (req, res) => {
    var r = { r: 0 };
    const fieldsToCheck = ['email', 'first_name', 'last_name', 'role'];
    const errors = fieldsToCheck.filter(field => !req.body[field] || req.body[field].trim() === '');

    if (errors.length > 0) {
        r['r'] = 3; // invalid or empty fields
        res.send(JSON.stringify(r));
        return;
    }

    if (!validator.isEmail(req.body.email)) {
        r['r'] = 2; // invalid email
        res.send(JSON.stringify(r));
        return;
    }

    const email = req.body.email;
    const first_name = req.body.first_name;
    const last_name = req.body.last_name;
    const password = `${first_name.toLowerCase()}123456`;
    const role = req.body.role;

    var today = new Date();
    var day = String(today.getDate()).padStart(2, '0');
    var month = String(today.getMonth() + 1).padStart(2, '0');
    var year = today.getFullYear();
    var formattedDate = `${year}-${month}-${day}`;


    await admin_fauth.createUser({
        email: email,
        emailVerified: true,
        password: password,
        displayName: `${first_name} ${last_name}`,
    }).then(async (userRecord) => {
        var data = {
            email: email,
            first_name: first_name,
            last_name: last_name,
            role: role,
            user_id: userRecord.uid,
            profile_img: '',
            phone_number: '',
        }
        if (role == 'student') {
            if (req.body.pass && req.body.pass.trim() != '') {
                data.pass = req.body.pass,
                    data.pass_start_date = formattedDate,
                    data.pass_status = 1
            } else {
                data.pass = ''
            }
        }
        await fdb.collection('panels').doc(req.session.panel_id).collection('users').doc(userRecord.uid).set(data).then(() => {
            r['r'] = 1;
            res.send(JSON.stringify(r));
        });
    }).catch((err) => {

        if (err.code == 'auth/email-already-exists') {
            r['r'] = 4;
        }
        console.log(err);
        res.send(JSON.stringify(r));
    });
});

router.get('/get-all', async (req, res) => {
    const panel_id = req.session.panel_id;
    const roles = req.query.roles;

    const data = [];
    try {
        if (roles == 'all') {
            await fdb.collection('panels').doc(panel_id).collection('users').get().then((users) => {
                users.forEach((u_doc) => {
                    data.push({
                        id: u_doc.id,
                        first_name: u_doc.data().first_name,
                        last_name: u_doc.data().last_name,
                        email: u_doc.data().email,
                        role: u_doc.data().role,
                        profile_img: u_doc.data().profile_img,
                        phone_number: u_doc.data().phone_number,
                        pass: u_doc.data().pass,
                        pass_status: u_doc.data().pass_status
                    });
                });
                res.send(JSON.stringify(data));
            });
        } else {
            await fdb.collection('panels').doc(panel_id).collection('users').where('role', '==', roles).get().then((users) => {
                users.forEach((u_doc) => {
                    data.push({
                        id: u_doc.id,
                        first_name: u_doc.data().first_name,
                        last_name: u_doc.data().last_name,
                        email: u_doc.data().email,
                        role: u_doc.data().role,
                        profile_img: u_doc.data().profile_img,
                        phone_number: u_doc.data().phone_number
                    });
                });
                res.send(JSON.stringify(data));
            });
        }
    } catch (e) {
        var r = { r: 0 };
        res.send(JSON.stringify(r));
    }
});

router.get('/get', async (req, res) => {
    const panel_id = req.session.panel_id;
    const user_id = req.session.user_id;

    try {
        await fdb.collection('panels').doc(panel_id).collection('users').doc(user_id).get().then((user) => {
            let data = {
                email: user.data().email,
                first_name: user.data().first_name,
                last_name: user.data().last_name,
                profile_img: user.data().profile_img,
                role: user.data().role,
                description: user.data().description,
                phone_number: user.data().phone_number,
                telegram_token: encode(user.id, 3)
            }

            if (user.data().role == 'student') {
                data.pass = user.data().pass;
                data.pass_status = user.data().pass_status;
            }
            console.log(user.data());
            res.send(JSON.stringify(data));
        });
    } catch (e) {
        console.log(e)
        var r = { r: 0 };
        res.send(JSON.stringify(r));
    }
});

router.post('/edit', async (req, res) => {
    var r = { r: 0 }
    const fieldsToCheck = ['first_name', 'last_name', 'role'];
    const errors = fieldsToCheck.filter(field => !req.body[field] || req.body[field].trim() === '');

    if (errors.length > 0) {
        r['r'] = 3; // invalid or empty fields
        res.send(JSON.stringify(r));
    }


    const user_id = req.body.user_id;
    const first_name = req.body.first_name;
    const last_name = req.body.last_name;
    const phone_number = req.body.phone_number;
    const role = req.body.role;
    const pass = req.body.pass;
    const pass_status = req.body.pass_status;

    var today = new Date();
    var day = String(today.getDate()).padStart(2, '0');
    var month = String(today.getMonth() + 1).padStart(2, '0');
    var year = today.getFullYear();
    var formattedDate = `${year}-${month}-${day}`;

    let updateData = {
        first_name: first_name,
        last_name: last_name,
        phone_number: phone_number,
        role: role,
    }

    if (role.toLowerCase() === 'student') {
        if (pass != '') {
            updateData.pass = pass;
            updateData.pass_start_date = formattedDate;
            if (pass_status != '') {
                updateData.pass_status = parseInt(pass_status);
            } else {
                updateData.pass_status = 1;
            }
        } else {
            updateData.pass = '';
            updateData.pass_start_date = '';
            updateData.pass_status = '';
        }
    }


    await fdb.collection('panels').doc(req.session.panel_id).collection('users').doc(user_id).update(updateData).then(() => {
        r['r'] = 1;
        res.send(JSON.stringify(r));
    }).catch((e) => {
        console.log(e);
        res.send(JSON.stringify(r));
    });
});

router.post('/delete', async (req, res) => {
    var r = { r: 0 }

    const user_id = req.body.user_id;
    await fdb.collection('panels').doc(req.session.panel_id).collection('users').doc(user_id).delete().then(() => {
        r['r'] = 1;
        res.send(JSON.stringify(r));
    }).catch((e) => {
        console.log(e);
        res.send(JSON.stringify(r));
    });
});


router.get('/get-csv', async (req, res) => {
    var users = [];
    var panel_id = req.session.panel_id;
    await fdb.collection('panels').doc(panel_id).collection('users').where('role', '==', 'student').get().then((usersQs) => {
        usersQs.docs.forEach((user) => {
            var data ={
                email: user.data().email, 
                first_name: user.data().first_name,
                last_name: user.data().last_name,
                phone_number: user.data().phone_number,
            }
            if(user.data().pass) data.pass_section = JSON.parse(user.data().pass).pass_section
            users.push(data)
        })
    });

    const json2csvParser = new Json2csvParser({});
    const csv = json2csvParser.parse(users);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=spreadsheet.csv");
    res.end(csv);
});

module.exports = router;