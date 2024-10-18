const express = require('express');
const router = express.Router();
const { fdb } = require("../libs/firebase_db");




router.post('/grade', async (req, res) => {
    var r = { r: 0 };
    const { writing_text } = req.body;
    console.log(req.body)
    requestAI(writing_text).then(data=>{
        res.send(data)
    })
  
    // await fdb.collection('writings').add({
    //     repetition: repetition,
    //     event_name: event_name,
    //     time: time,
    //     event_date: event_date,
    //     week_day: week_day,
    //     coach_id: coach_id,
    //     coach_name: coach_name,
    //     members: '[]'
    // }).then(() => {
        
    // }).catch((e) => {
    //     console.log(e)
    //     res.send(JSON.stringify(r));
    // })
});





module.exports = router;