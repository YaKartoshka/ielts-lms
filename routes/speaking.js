const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');
const { fdb } = require("../libs/firebase_db");
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs')
const multer = require('multer');

const textToSpeech = require('@google-cloud/text-to-speech');
const speech = require('@google-cloud/speech');
const speech_client = new speech.SpeechClient();
const { writeFile } = require('node:fs/promises');

const path = require('path')
const WebSocket = require('ws');

const storage = multer.diskStorage({
    destination: './temp',  // Folder where audio files will be stored
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname)); // Save with unique name
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10000000 },  // Set file size limit (optional)
    fileFilter: function (req, file, cb) {
        // Check file type
        const filetypes = /mp3|wav|ogg/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Audio files only!');
        }
    }
}).single('audioFile');

const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
const openai_ws = new WebSocket(url, {
    headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "OpenAI-Beta": "realtime=v1",
    },
});


const wss = new WebSocket.Server({ port: 4001 });
const clients = new Map();


openai_ws.on("open", function open() {
    console.log("Connected to server.");
    openai_ws.send(JSON.stringify({
        "event_id": "event_123",
        "type": "session.update",
        "session": {
            "modalities": ["text", "audio"],
            "instructions": " Please respond without using markdown formatting or newline characters",
            "voice": "alloy",
            "input_audio_format": "pcm16",
            "output_audio_format": "pcm16",
            "input_audio_transcription": {
                "model": "whisper-1"
            },
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 200
            },
            "tools": [
                {
                    "type": "function",
                    "name": "get_weather",
                    "description": "Get the current weather for a location.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "location": { "type": "string" }
                        },
                        "required": ["location"]
                    }
                }
            ],
            "tool_choice": "auto",
            "temperature": 0.8,
        }
    }
    ));
});

openai_ws.on("message", function incoming(message) {
    const parsedMessage = JSON.parse(message.toString());

    if (parsedMessage.type === "response.content_part.done") {
        console.log(parsedMessage)
        const transcript = parsedMessage.part.transcript;
        console.log(transcript)
        const targetClientID = "user1";
        const targetClient = clients.get(targetClientID);

        if (targetClient && targetClient.readyState === WebSocket.OPEN) {
            targetClient.send(JSON.stringify(transcript));
        } else {
            console.log(`Client ${targetClientID} not connected or WebSocket not open.`);
        }
    }
});

wss.on('connection', (ws) => {
    console.log('Client connected');
    var writeStream = '';
    const clientID = 'user1';
    clients.set(clientID, ws);
    ws.on('message', (data) => {
        if (data.toString() == 'started') {
            writeStream = fs.createWriteStream(path.join(__dirname, 'temp', 'audio_stream.wav'), { flags: 'a' });
        } else if (data.toString() == 'finished') {
            if (!writeStream) return
            writeStream.end();

            const inputFilePath = path.join(__dirname, 'temp', 'audio_stream.wav');
            const outputFilePath = path.join(__dirname, 'temp', 'audio_stream_converted.wav');

            ffmpeg(inputFilePath)
                .outputOptions('-ar 24000')
                .save(outputFilePath)
                .on('end', () => {
                    console.log('Audio conversion finished');
                    fs.readFile(outputFilePath, (err, data) => {
                        if (err) {
                            return console.log(err);
                        }

                        const base64Audio = Buffer.from(data).toString('base64');

                        const event = {
                            event_id: "event_123",
                            type: 'conversation.item.create',
                            item: {
                                type: 'message',
                                role: 'user',
                                content: [
                                    {
                                        type: 'input_audio',
                                        audio: base64Audio
                                    }
                                ]
                            }
                        };
                        console.log(event)
                        openai_ws.send(JSON.stringify(event));
                        openai_ws.send(JSON.stringify({ type: 'response.create' }));
                        fs.unlink(inputFilePath, (err) => {
                            if (err) {
                                console.error(`Error removing file ${inputFilePath}:`, err);
                            } else {
                                console.log(`${inputFilePath} was deleted`);
                            }
                        });

                        fs.unlink(outputFilePath, (err) => {
                            if (err) {
                                console.error(`Error removing file ${outputFilePath}:`, err);
                            } else {
                                console.log(`${outputFilePath} was deleted`);
                            }
                        });
                    });
                })
                .on('error', (err) => {
                    console.error('Error during conversion:', err);
                });
        } else {
            writeStream.write(Buffer.from(new Uint8Array(data)));
        }
    });
});


// Creates a client
const client = new textToSpeech.TextToSpeechClient();
const voice_storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'temp/'); // Specify the upload directory
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Name the file uniquely
    }
});

const voice_upload = multer({ storage: storage });
router.post('/audio', voice_upload.single('audio'), async (req, res) => {
    const filePath = path.join(__dirname, '../temp', req.file.filename);

    try {
        // Read the uploaded audio file
        const audioBytes = fs.readFileSync(filePath).toString('base64');

        // Configure the request for transcription
        const audio = {
            content: audioBytes,
        };

        const config = {
            encoding: 'WEBM_OPUS', // Adjust according to your file format (WEBM_OPUS for webm)
            sampleRateHertz: 48000, // Set appropriate sample rate
            languageCode: 'en-US',  // Change to desired language code
        };

        const request = {
            audio: audio,
            config: config,
        };

        // Transcribe the audio file
        const [response] = await speech_client.recognize(request);
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join('\n');

        console.log(`Transcription: ${transcription}`);

        // Respond with the transcription
        requestAISpeaking().then((data)=>{
            res.send(data)
        })

    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).send({ error: 'Failed to transcribe audio' });
    }
});

router.post('/question', async (req, res) => {
    requestAIQuestion().then(data => {
        res.send(data)
    })
});




function getLangCode(lang) {
    if (lang == 'ch') {
        return 'yue-HK'
    } else if (lang == 'fr') {
        return 'fr-FR'
    } else if (lang == 'sp') {
        return 'es-ES'
    } else if (lang == 'ru') {
        return 'ru-RU'
    } else {
        return 'en-US'
    }
}



module.exports = router;