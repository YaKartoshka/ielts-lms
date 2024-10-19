const express = require('express');
const router = express.Router();
const { fdb } = require("../libs/firebase_db");
const { request } = require('express');





router.post('/tfng', async (req, res) => {
    var r = { r: 0 };
    var {difficulty, lang} = req.body;
 
    
    requestAITFNG(difficulty).then((data)=>{
        res.send(data)
    })
   
   
});


module.exports = router;