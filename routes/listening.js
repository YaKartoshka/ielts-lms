const express = require('express');
const router = express.Router();

const { GoogleAuth } = require('google-auth-library');
const async_func = require('async');
const fs = require('fs');
const path = require('path');

const request = require('request');
const textToSpeech = require('@google-cloud/text-to-speech');
const client = new textToSpeech.TextToSpeechClient({ keyFilename: path.join(__dirname) + '/service_account.json' });
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const mp3Duration = require('mp3-duration');




const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');


;
ffmpeg.setFfmpegPath(ffmpegStatic);


router.get('/generate_cartoon', async (req, res) => {
    try {
        var prompt = req.query.prompt;
        var lang = req.query.lang;
        var randomId = Math.floor(10000000 + Math.random() * 90000000);
        var user_id = 'user' + randomId;
        var scenario = JSON.parse(await generateScenario(prompt, lang));

        var scenario_with_images = await generateScenarioImages(user_id, scenario);
        scenario_with_images = await generateSpeech(user_id, scenario_with_images, lang);
        var scenario_videos = await makeVideoScenario(user_id, scenario_with_images);
        var cartoon = await makeCartoon(user_id, scenario_videos);
        var cartoon_subtitles = await setSubtitle(user_id, scenario, lang);
        var cartoon_music = await setMusic(user_id);
    
        var cartoon_link = '/cartoons/' + user_id + '/cartoon.mp4'
        var r = { link: cartoon_link, user_id: user_id }
      

        setTimeout(()=>{
            res.send(JSON.stringify(r))
        }, 15000)
       
    } catch (e) {
        console.log(e)
        var r = { r: 0 }
        res.send(JSON.stringify(r))
    }

})

async function generateAccessToken() {
    const keyFilePath = path.join(__dirname, 'service_account.json');
    const envFilePath = path.join(__dirname, '../', '.env');
    const auth = new GoogleAuth({
        keyFile: keyFilePath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (accessToken.token) {

        const envContent = fs.readFileSync(envFilePath, { encoding: 'utf8' });
        console.log('access token updated')
        let newEnvContent;
        if (envContent.includes('GCLOUD_TOKEN=')) {
            newEnvContent = envContent.replace(/GCLOUD_TOKEN=.*/, `GCLOUD_TOKEN=${accessToken.token}`);
        } else {
            newEnvContent = `${envContent}\GCLOUD_TOKEN=${accessToken.token}\n`;
        }

        fs.writeFileSync(envFilePath, newEnvContent, { encoding: 'utf8' });

    } else {
        console.error('Failed to generate access token');
    }
}

setInterval(generateAccessToken, 900000);
generateAccessToken()

async function generateScenario(prompt, lang) {
    return new Promise((resolve, reject) => {
        var structure = `
        [
            {
                type: "scene 1",
                instruction: "Generate an image with the following description",
                description: {
                    location: "Describe the location in detail (e.g., a sunny park with a fountain in the middle)",
                    characters: [
                        {
                            name: "Character Name",
                            appearance: "Detailed description of the character's look (e.g., a tall man with short brown hair, white skin, wearing a blue jacket and glasses)",
                            role: "Role or context for the character (e.g., the protagonist who is happily playing with a dog)"
                        }
                        // Add more characters as needed
                    ]
                },
                dialogues: [
                    {character: "Name of Character", text: "Dialogue of the character"}
                ]
            }
            // Add more scenes as needed
        ]
        `;

        var options = {
            method: 'POST',
            url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + process.env.GEMINI_API_KEY,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "contents": [
                    {
                        "parts": [
                            {
                                "text": `Generation scenario for a cartoon to improve mood, based on a prompt in an array of objects format.
                                         Prompt: ${prompt}
                                         * Do not add any comments. Provide only the const array in JSON format.
                                         * Maintain consistent character appearances across all scenes, but provide a detailed description of each character's appearance in every scene, even if it remains unchanged.
                                         * Provide a minimum of 4 scenes.
                                         * Dialog language must be ${lang == 'ru' ? 'Russian' : 'English'}
                                         * dialog for each scene no more than 2 without including any descriptive actions or emotions in parentheses.
                                         * no children
                                         * More details for characters appearance
                                         * Ensure all dialogues are non-empty,aligned with the mood of each scene and contain text.
                                         * Use varying expressions and emotions for characters to avoid redundant words such as the same.
                                         * Use the provided JSON structure format: '${structure}'.
                                         * It must be JSON`

                            }
                        ]
                    }
                ]
            })
        };

        function validateJson(data) {
            try {
                JSON.parse(data);
                return true;
            } catch (e) {
                return false;
            }
        }

        function handleResponse(error, response) {
            if (error) {
                reject(error);
            } else {
                let jsonData;
                try {
                    var resp = JSON.parse(response.body)
                    var scenario_json = resp.candidates[0].content.parts[0].text
                    let jsonData = scenario_json.replace(/json/g, '').replace(/```/g, '');

                    console.log(jsonData)
                    if (validateJson(jsonData)) {
                        resolve(jsonData);
                    } else {
                        console.log("Invalid JSON, retrying...");
                        generateScenario(prompt).then(resolve).catch(reject);
                    }
                } catch (parseError) {
                    reject(parseError);
                }
            }
        }

        request(options, handleResponse);
    });
}


async function generateScenarioImages(user_id, scenario) {
    return new Promise((resolve, reject) => {
        var index = 0
      
        async_func.eachSeries(scenario, async (scene, cb) => {
            const charactersString = scene.description.characters.map(character =>
                `Name: ${character.name}, Appearance: ${character.appearance}, Role: ${character.role}`
            ).join('; ');

            
            var prompt = `${charactersString}. ${scene.description.location}`;
            if (index > 1) {
                let appearanceString = scenario[0].description.characters.map((character, index) => {
                    // Fallback in case the second array doesn't have enough characters
                    let additionalCharacter = scene.description.characters[index] || {};

                    // Combining appearance from both arrays
                    return `Name: ${additionalCharacter.name}, Appearance: ${character.appearance}; Role: ${additionalCharacter.role || 'N/A'}`;
                }).join('; ');


                prompt = ` ${appearanceString}. ${scene.description.location}`;
            }

            var options = {
                'method': 'POST',
                'url': 'https://us-central1-aiplatform.googleapis.com/v1/projects/725421326656/locations/us-central1/publishers/google/models/imagen-3.0-fast-generate-001:predict',
                'headers': {
                    'Authorization': `Bearer ${process.env.GCLOUD_TOKEN}`,
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: `{"instances": [
                     {"prompt": "Image style: Cartoon Disney 2D Humans. ${scene.description.location}. ${charactersString}" }
                ], 
                    "parameters": {   
                    "sampleCount": 1 ,
                    }}`
            };
            // {"prompt": "Cartoon Cute cat" }
            // {"prompt": "${scene.description.location}. ${charactersString}" }
            request(options, (error, response) => {
                if (error) {
                    console.error(error);
                    scene['image'] = 'error';
                    return cb(null, true);
                }

                try {
                    const data = JSON.parse(response.body);
                    console.log(data)
                    console.log(charactersString)
                    const base64str = data.predictions[0].bytesBase64Encoded;
                    const base64Data = base64str.replace(/^data:image\/\w+;base64,/, "");
                    const buffer = Buffer.from(base64Data, 'base64');

                    const dirPath = path.join(__dirname, user_id + '/images');
                    const imagePath = path.join(dirPath, `image${index}.png`);


                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }

                    fs.writeFile(imagePath, buffer, (err) => {
                        if (err) {
                            console.error('Error writing the image file:', err);
                            scene['image'] = 'error';
                        } else {
                            scene['image'] = imagePath;
                            console.log('The image file was successfully saved!');
                        }
                        cb(null, true);
                    });
                    index++
                } catch (parseError) {
                    console.error('Error parsing response:', parseError);
                    scene['image'] = 'error';
                    cb(null, true);
                }
            });
        }, function done() {
            resolve(scenario);
        });
    });
}

async function generateSpeech(user_id, scenario, lang) {
    return new Promise((resolve, reject) => {
        var scene_index = 0;

        async_func.eachSeries(scenario, async (scene, cb) => {
            try {
                for (let index = 0; index < scene.dialogues.length; index++) {
                    const dialogue = scene.dialogues[index];
                    const text = dialogue.text;

                    const request = {
                        input: { text: text },
                        voice: {
                            languageCode: lang=='en' ? 'en-US' : 'ru-RU',
                            ssmlGender: 'FEMALE',
                            name: lang=='en' ? 'en-US-Studio-O' : 'ru-RU-Standard-C',
                        },
                        audioConfig: { audioEncoding: 'MP3', speakingRate: lang=='en' ? 0.6 : 1 }
                    };

                    const [response] = await client.synthesizeSpeech(request);
                    console.log(response)
                    const dirPath = path.join(__dirname, user_id);
                    const speechPath = path.join(dirPath, `speech${scene_index}-${index}.mp3`);

                    fs.writeFileSync(speechPath, response.audioContent, 'binary');
                    dialogue['speech_audio'] = speechPath;
                }

                cb(null, true);
            } catch (error) {
                console.log(error)
                cb(error); // Pass error to the callback to handle it appropriately
            }
            scene_index++;
        }, function done(err) {
            if (err) {
                console.log(err)
                reject(err); // Reject the promise if an error occurs
            } else {
                resolve(scenario);
            }
        });
    });

}

function makeVideoScenario(user_id, scenario) {
    return new Promise((resolve, reject) => {
        var scene_index = 0;
        const userDir = path.join(__dirname, user_id, 'videos');

        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }

        // Function to process the scenario
        const processScenario = () => new Promise((resolve, reject) => {
            async_func.eachSeries(scenario, async (scene, cb) => {
                try {
                    for (let index = 0; index < scene.dialogues.length; index++) {
                        const videoPath = path.join(userDir, `image${scene_index}-${index}.mov`);
                        const image = scene.image;
                        const audioPath = scene.dialogues[index].speech_audio;
                        const subtitleText = scene.dialogues[index].text;

                        try {
                            // Obtain the duration of the audio
                            const duration = await new Promise((resolve, reject) => {
                                mp3Duration(audioPath, (err, duration) => {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve(duration);
                                    }
                                });
                            });

                            // Create the video with ffmpeg
                            await new Promise((resolve, reject) => {
                                ffmpeg()
                                    .input(image)
                                    .loop(duration + 1)
                                    .input(audioPath)
                                    .outputOptions(['-map 0:v', '-map 1:a', '-shortest', '-c:v copy', '-filter:a volume=0.9'])
                                    .output(videoPath)
                                    .on('end', () => {
                                        console.log(`Video created: ${videoPath}`);
                                        resolve();
                                    })
                                    .on('error', (err) => {
                                        console.error(`Error creating video: ${err.message}`);
                                        reject(err);
                                    })
                                    .run();
                            });

                        } catch (err) {
                            console.error(`Error processing scene ${scene_index}-${index}: ${err.message}`);
                        }
                    }

                    // Increment the scene index after processing all dialogues
                    scene_index++;
                    cb(null, true);

                } catch (error) {
                    console.log('makeVideoScenario: ' + error);
                    cb(error); // Pass error to callback to ensure proper handling
                }
            }, function done(err) {
                if (err) {
                    console.error('Error processing scenario:', err);
                    reject(err);
                } else {
                    console.log('Scenario processing completed successfully');
                    resolve(scenario);
                }
            });
        });

        // Timeout promise to resolve the scenario after 90 seconds
        const timeout = new Promise((resolve) => {
            setTimeout(() => {
                console.warn('Scenario processing timed out after 90 seconds.');
                resolve(scenario);
            }, 90 * 1000); // 90 seconds timeout
        });

        // Race between the process scenario and the timeout
        Promise.race([processScenario(), timeout])
            .then(result => resolve(result))
            .catch(err => reject(err));
    });
}

async function getAudioDuration(filePath) {
    const { stdout } = await exec(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${filePath}`);
    return parseFloat(stdout);
}

async function setSubtitle(user_id, scenario, lang) {
    const video_path = path.join(__dirname, user_id, 'result', 'merged.mov');
    const srtPath = await generateSubtitles(user_id, scenario, lang);

    const outputVideoPath = path.join(__dirname, user_id, 'result', 'merged_with_subtitles.mov');

    // Ensure the paths are properly quoted for ffmpeg
    const quotedVideoPath = `"${video_path}"`;
    const quotedSrtPath = `${user_id}/subtitles.srt`;
    const quotedOutputVideoPath = `"${outputVideoPath}"`;

    try {
        const { stdout, stderr } = await exec(`ffmpeg -i ${quotedVideoPath} -vf subtitles=${quotedSrtPath} ${quotedOutputVideoPath}`);
        console.log(stdout, stderr);
    } catch (error) {
        console.error('Error while applying subtitles:', error);
    }
}

async function generateSubtitles(user_id, scenario, lang) {
    const speeches_path = path.join(__dirname, user_id);
    let srtContent = '';
    let startTime = 0;
    let subtitle_index = 1;
    let scene_index = 0
    for (const scene of scenario) {
        let index = 0;
        for (const dialogue of scene.dialogues) {
            const audioFile = path.join(speeches_path, `speech${scene_index}-${index}.mp3`);
            const duration = await getAudioDuration(audioFile);

            var endTime = startTime + duration + 1;

            // Convert seconds to SRT time format (HH:MM:SS,MS)
            const start = new Date(startTime * 1000).toISOString().substr(11, 12).replace('.', ',');
            const end = new Date(endTime * 1000).toISOString().substr(11, 12).replace('.', ',');
            if (lang=='en') srtContent += `${subtitle_index}\n${start} --> ${end}\n${dialogue.character}: ${dialogue.text}\n\n`;
            else srtContent += `${subtitle_index}\n${start} --> ${end}\n${dialogue.text}\n\n`;

            startTime = endTime; // Update for next subtitle
            index++;
            subtitle_index++;
        }
        scene_index++;
    }

    const srtPath = path.join(__dirname, user_id, 'subtitles.srt');
    fs.writeFileSync(srtPath, srtContent);
    return srtPath;
}

function makeCartoon(user_id, scenario) {
    return new Promise((resolve, reject) => {
        const userDir = path.join(__dirname, user_id, 'result');
        const videosDir = path.join(__dirname, user_id, 'videos');
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }

        const outputFilePath = userDir + '/merged.mov';


        const videoFiles = fs.readdirSync(videosDir).filter(file => {
            return file.endsWith('.mov');
        });

        const command = ffmpeg();

        videoFiles.forEach(video => {
            command.input(path.join(videosDir, video));
        });

        command
            .on('error', (err) => {
                console.error('Error makeCartoon:', err.message);
            })
            .on('end', () => {
                console.log('Merging finished!');
                resolve(outputFilePath)

            })
            .mergeToFile(outputFilePath)
    });
}

async function setMusic(user_id) {
    new Promise((resolve, reject) => {
        const audioPath = path.join(__dirname, 'background.mp3');
        const outputDir = path.join(__dirname, 'public', 'cartoons', user_id);
        const videoPath = path.join(__dirname, user_id, 'result', 'merged_with_subtitles.mov');
        const user_dir_path = path.join(__dirname, user_id);
        const outputPath = path.join(outputDir, 'cartoon.mov');
    
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
    
        ffmpeg()
            .addInput(videoPath)
            .addInput(audioPath)
            .complexFilter([
                '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=3,volume=0.3[a]', 'format=yuv420p'
            ])
            .outputOptions([
                '-map 0:v',           
                '-map [a]',          
                '-c:v libx264',   
                '-c:a aac',    
                '-b:a 128k',
                '-ar 44100',   
                '-movflags +faststart',
                '-shortest',
                '-f mov'
              ])
            .output(outputPath)
            .on('start', (command) => {
                // console.log('TCL: command -> command', command)
            })
            .on('error', (error) => console.log("errrrr", error))
            .on('end', async () => {
                console.log("Processing finished!")
          
                await fixCodec(user_id);
                resolve(true)
                fs.rm(user_dir_path, { recursive: true, force: true }, (err) => {
                    if (err) {
                        console.error(`Error removing directory: ${err}`);
                    } else {
                        console.log(`User directory ${user_dir_path} removed.`);
                    }
                });
            } )
            .run();
    })
}

async function fixCodec(user_id) {
    const inputDir = path.join(__dirname, 'public', 'cartoons', user_id);
    const inputPath = path.join(inputDir, 'cartoon.mov');
    const outputPath = path.join(inputDir, 'cartoon.mp4');


    // FFmpeg command to convert the video
    const command = `ffmpeg -i "${inputPath}" -vf "format=yuv420p" -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k "${outputPath}"`;

    // Execute the FFmpeg command
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing FFmpeg: ${error.message}`);
            return;
        }

        if (stderr) {
            console.error(`FFmpeg stderr: ${stderr}`);
        }

        fs.rm(inputPath, { recursive: true, force: true }, (err) => {
            if (err) {
                console.error(`Error removing directory: ${err}`);
            } else {
                console.log(`${inputPath} removed.`);
            }
        });
    });
}



module.exports = router;