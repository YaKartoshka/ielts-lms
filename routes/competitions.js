const express = require('express');
const router = express.Router();
const multer = require('multer');
const { fdb } = require("../libs/firebase_db");
const fs = require('fs');

const admin = require('firebase-admin');
const storage = admin.storage().bucket('gs://coach-mate-b8795.appspot.com')
const uuid = require('uuid-v4');
const { JsonDatabase } = require('brackets-json-db');


const multer_storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, conf.temp_path);
    },
    filename(req, file, cb) {
        cb(null, `${file.originalname}`);
    }
});

const limits = {
    fileSize: 1024 * 1024 * 50
}

const upload = multer({
    storage: multer_storage,
    limits: limits
});

const metadata = {
    metadata: {
        firebaseStorageDownloadTokens: uuid()
    },
    contentType: 'image/png',
    cacheControl: 'public, max-age=31536000',
};

function isAuthenticated(req, res, next) {
    if (!req.session.isAuthenticated) {
        return res.send('Unauthorized access'); // redirect to sign-in route
    }
    next();
};

router.get('/create', isAuthenticated, (req, res) => {
    res.render('competition_create', { role: req.session.role, L:L, language: req.cookies.language ? req.cookies.language : 'en' });
});

router.post('/create', isAuthenticated, upload.single('event_img'), async (req, res) => {
    var r = { r: 0 };
    console.log(req.body)
    const event_img = req.file;
    const { event_name, organizer_name, description, city, address, normal_start_date, normal_end_date, late_start_date, late_end_date, event_start, event_time, phone_number, email, entries } = req.body;

    if (!event_name || !organizer_name || !description || !city || !address || !normal_start_date || !normal_end_date || !event_start || !phone_number || !email) {
        return res.send(JSON.stringify(r));
    }

    await fdb.collection('competitions').add({
        event_name: event_name,
        organizer_name: organizer_name,
        organizer_id: req.session.user_id,
        description: description,
        city: city,
        address: address,
        normal_registration: {
            start_date: normal_start_date,
            end_date: normal_end_date
        },
        late_registration: {
            start_date: late_start_date,
            end_date: late_end_date
        },
        event_start: event_start,
        event_time: event_time,
        phone_number: phone_number,
        email: email,
        entries: entries,
        event_img: event_img
    }).then(async (comp) => {
        await storage.upload(event_img.path, {
            gzip: true,
            metadata: metadata,
            destination: `events/${comp.id}`
        });
        var event_img_url = `https://firebasestorage.googleapis.com/v0/b/coach-mate-b8795.appspot.com/o/events%2F${comp.id}?alt=media`

        await fdb.collection('competitions').doc(comp.id).update({ event_img: event_img_url }).then(() => {
            r['r'] = 1;
            res.send(r);
            fs.unlink(event_img.path, () => { });
        });

    }).catch((e) => {
        console.log(e)
        res.send(JSON.stringify(r));
        fs.unlink(event_img.path, () => { });
    })
});

router.post('/get-all', async (req, res) => {
    var data = [];
    const competitions = await fdb.collection('competitions').get();
    competitions.docs.forEach((comp) => {
        data.push({ ...comp.data(), comp_id: comp.id });
    });
    res.send(data);
});

router.get('/:id', async (req, res) => {
    const comp_id = req.params.id;

    await fdb.collection('competitions').doc(comp_id).get().then((comp) => {
        if (!comp.exists) {
            return res.render('error');
        }
        console.log(comp.data());
        res.render('competition', { comp_data: { ...comp.data(), comp_id: comp.id }, role: req.session.role, user_id: req.session.user_id,  L:L, language: req.cookies.language ? req.cookies.language : 'en' })
    });
});

router.post('/:id/participant', async (req, res) => {
    var r = { r: 0 };
    const comp_id = req.params.id;
    const action = req.body.action;

    if (action == 'addParticipant') {
        let { first_name, last_name, year_of_birth, entry, user_img } = req.body;
        await fdb.collection('competitions').doc(comp_id).get().then(async (comp) => {
            var participants = comp.data().participants;
            if (!comp.exists) {
                return res.send(JSON.stringify(r));
            }

            if (!participants) {
                participants = [];
            } else participants = JSON.parse(participants);

            await fdb.collection('competitions').doc(comp_id).update({
                participants: JSON.stringify([...participants, { first_name: first_name, last_name: last_name, user_id: req.session.user_id, panel_name: req.session.panel_name, panel_id: req.session.panel_id, year_of_birth: year_of_birth, entry: entry, user_img: user_img }])
            }).then(() => {
                r['r'] = 1;
                r['user_id'] = req.session.user_id;
                r['panel_id'] = req.session.panel_id;
                r['panel_name'] = req.session.panel_name;
                return res.send(JSON.stringify(r));
            });
        });
    }

    else

        if (action == 'editParticipant') {
            let { first_name, last_name, year_of_birth, entry, user_id } = req.body;
            await fdb.collection('competitions').doc(comp_id).get().then(async (comp) => {
                var participants = comp.data().participants;
                if (!comp.exists) {
                    return res.send(JSON.stringify(r));
                }

                if (!participants) {
                    participants = [];
                } else participants = JSON.parse(participants);

                var updated_participants = participants.map(p => {
                    if (p.user_id == user_id) {
                        return {
                            ...p,
                            first_name: first_name,
                            last_name: last_name,
                            year_of_birth: year_of_birth,
                            entry: entry
                        }
                    }
                    return p;
                });

                await fdb.collection('competitions').doc(comp_id).update({
                    participants: JSON.stringify(updated_participants)
                }).then(() => {
                    r['r'] = 1;
                    return res.send(JSON.stringify(r));
                });
            });
        }

        else

            if (action == 'deleteParticipant') {
                let { user_id } = req.body;
                await fdb.collection('competitions').doc(comp_id).get().then(async (comp) => {
                    var participants = JSON.parse(comp.data().participants);
                    if (!comp.exists) {
                        return res.send(JSON.stringify(r));
                    }


                    var updated_participants = participants.filter(p => p.user_id != user_id);

                    await fdb.collection('competitions').doc(comp_id).update({
                        participants: JSON.stringify(updated_participants)
                    }).then(() => {
                        r['r'] = 1;
                        return res.send(JSON.stringify(r));
                    });
                });
            }
});

router.post('/:id/bracket', async(req, res) => {
    var action = req.body.action, r = { r: 0 };
    console.log(req.body)
    if (action == "createBracket") {
        var participants = req.body.participants;
        var name = req.body.name;
        const bracketStorage = new JsonDatabase(req.params.id+ '-'+ name + '.json');
        const { BracketsManager } = require('brackets-manager');
        const manager = new BracketsManager(bracketStorage);
        
        const data = await manager.create({
            name: name,
            tournamentId: req.params.id, 
            type: 'double_elimination',
            seeding: participants
        });
        if(data){
            fs.readFile('./' + req.params.id+ '-'+ name + '.json' , 'utf8', async (err, data) => {
                if (err) {
                  console.error('Error reading file:', err);
                  return;
                }
              
                try {
                  await fdb.collection('competitions').doc(req.params.id).collection('brackets').add({
                    name: name,
                    bracket_data: data
                  }).then(()=>{
                    fs.unlink('./' + req.params.id+ '-'+ name + '.json', function(){
                        r['r'] = 1;
                        res.send(JSON.stringify(r));
                    })
                  })
                 
                  
                } catch (error) {
                  console.error('Error parsing JSON:', error);
                  r['r'] = 0;
                  res.send(JSON.stringify(r));
                }
              });
            
        } else {
            r['r'] = 0;
            res.send(JSON.stringify(r));
        }
       
    }

    else 

    if(action == "getBrackets"){
        var data = [];
        var data = [];
        const brackets = await fdb.collection('competitions').doc(req.params.id).collection('brackets').get();
        brackets.docs.forEach((bracket) => {
            data.push({ ...bracket.data(), bracket_id: bracket.id });
        });
        res.send(data);
    }

    else

    if(action == "updateBracket"){
        var bracket_id = req.body.bracket_id;
        var bracket_data = req.body.bracket_data;
        await fdb.collection('competitions').doc(req.params.id).collection('brackets').doc(bracket_id).update({
            bracket_data: bracket_data
          }).then(()=>{
            r['r'] = 1;
            res.send(JSON.stringify(r));
          });
    }

    else 

    if(action == "deleteBracket"){
        var bracket_id = req.body.bracket_id;
        await fdb.collection('competitions').doc(req.params.id).collection('brackets').doc(bracket_id).delete().then(()=>{
            r['r'] = 1;
            res.send(JSON.stringify(r));
          });
    }
})




module.exports = router;