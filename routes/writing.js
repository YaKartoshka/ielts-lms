const express = require('express');
const router = express.Router();
const { fdb } = require("../libs/firebase_db");




router.post('/grade', async (req, res) => {
    var r = { r: 0 };
    const { writing_text, title } = req.body;
    console.log(req.body)
    requestAIWriting(writing_text, title).then(data=>{
        res.send(data)
    })
  
});


router.post('/title', async (req, res) => {
    requestAITitle().then(data=>{
        res.send(data)
    })
});





module.exports = router;