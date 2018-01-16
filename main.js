const _ = require('underscore');
const fs = require('fs');
const path = require('path');
const request = require('request');
const child_process = require('child_process');
const util = require('util');
const open = require('open');
const querystring = require('querystring');
const AipOcrClient = require("baidu-aip-sdk").ocr;


// baidu ocr auth
const APP_ID = "";
const API_KEY = "";
const SECRET_KEY = "";

const IMG_ACTIVE_DIR = path.join(process.cwd(), "./screencap/");
const IMG_ARCHIVE_DIR = path.join(process.cwd(), "./screencap_archive/");


const client = new AipOcrClient(APP_ID, API_KEY, SECRET_KEY);
let RUNNING = false;


console.log("process start.\n");
setInterval(() => {
    if (RUNNING) {
        return
    }
    check();
}, 200);


function check() {
    RUNNING = true;
    fs.readdir(IMG_ACTIVE_DIR, (err, imgs) => {
        if (err) {
            console.error(err);
            RUNNING = false;
            return
        }

        // 读目录下的图片
        imgs = _.filter(imgs, img => img.match(/(jpg$)|(png$)/));
        if (imgs.length === 0) {
            //console.warn("no image");
            RUNNING = false;
            return
        }
        if (imgs.length > 1) {
            console.warn('image number > 1, select first');
        }

        const imgFilePath = path.resolve(IMG_ACTIVE_DIR, imgs[0]);
        const imgFileArchivePath = path.resolve(IMG_ARCHIVE_DIR, imgs[0]);
        const image = fs.readFileSync(imgFilePath).toString("base64");

        // ocr识别
        client.generalBasic(image).then((result) => {
            console.log("OCR:", JSON.stringify(result));
            if (result.error_code === 216201) {
                RUNNING = false;
                return
            }

            let questionWords = result.words_result;
            let answers = [];
            if (result.words_result.length > 3) {
                // 只处理3个选项
                let optionNumber = 3;
                //if (questionWords[questionWords.length-1].words.match(/^D\./)) {
                //    optionNumber = 4
                //}
                answers = questionWords.slice(-optionNumber);
                questionWords = questionWords.slice(0, -optionNumber);
            }

            answers = _.map(_.filter(_.pluck(answers, 'words'), answer => answer), answer => answer.toLowerCase());

            // 去掉无意义的词
            const uselessExpression = [
                '^\d+\.',
                '为什么',
                '不包括',
                '包括',
                '下面',
                '以下',
                '下列',
                '中的',
                '选项',
                '什么',
                '叫作',
                '是指',
                '的是',
                '意思',
                '哪些',
                '哪个',
                '哪首',
                '哪部',
                '哪种',
                '哪位',
                '哪项',
                '哪种',
            ];

            let regexp = new RegExp(_.map(uselessExpression, e => '(' + e + ')').join('|'), "gi");
            let question = _.map(questionWords, i => i.words).join("").replace(/(\s)|(^\d+\.)/g, "").replace(regexp, " ");
            question = question.replace(/(是\s*$)|(是\s+)|(与\s+)|([\?？\.。]\s*$)/g, " ");

            console.log("QUESTION:", question);
            console.log("OPTIONS:", answers);
            console.log("");

            if (!question) {
                console.warn("No question");
                RUNNING = false;
                return
            }

            // 打开浏览器
            let questionUrl = util.format('http://www.baidu.com/s?%s', querystring.stringify({
                wd: question
            }));
            open(questionUrl);

            analyseQuestion(question, answers);
            if (answers.length !== 0) {
                analyseQuestionAndAnswer(question, answers);
            }


            fs.renameSync(imgFilePath, imgFileArchivePath);
            RUNNING = false;
        }).catch((err) => {
            // 如果发生网络错误
            console.error(err);
            RUNNING = false
        });

    });
}


// 搜索问题, 检查结果和各个答案匹配数目
function analyseQuestion(question, answers) {
    if (answers.length === 0) {
        return;
    }

    const qs = {
        wd: question,
        rd: 50,
    };
    const cmd = util.format("curl -G http://www.baidu.com/s?%s", querystring.stringify(qs));
    child_process.exec(cmd, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 5000
    }, (err, stdout) => {
        if (err) {
            console.error(">>>>> A1 <<<<<\n");
            console.error("Failed:", err);
            return
        }

        stdout = stdout.toLowerCase();

        let result = _.map(answers, answer => {
            let number = 0;
            let idx = -1;
            for (;;) {
                idx = stdout.indexOf(answer, idx + 1);
                if (idx === -1) {
                    break
                }
                number++;
            }
            return {
                answer: answer,
                matchNumber: number,
            };
        });

        let maxNumber = _.max(_.pluck(result, 'matchNumber'));

        console.log(">>>>> A1 <<<<<\n");
        _.each(result, i => {
            console.log(i.answer, i.matchNumber);
            console.log("=".repeat(Math.ceil(i.matchNumber / maxNumber * 50)));
            console.log("");
        });

        console.log("\n");

    });
}


// 搜索问题+答案，比较百度搜索出的结果数
function analyseQuestionAndAnswer(question, answers) {
    if (answers.length === 0) {
        return;
    }


    let promises = _.map(answers, answer => {
        return new Promise((resolve, reject) => {
            const qs = {
                wd: question + " " + answer,
            };
            const cmd = util.format("curl -G http://www.baidu.com/s?%s", querystring.stringify(qs));
            child_process.exec(cmd, {
                maxBuffer: 10 * 1024 * 1024,
                timeout: 5000
            }, (err, stdout) => {
                if (err) {
                    console.error(err)
                    return resolve({
                        answer: answer,
                        matchNumber: 0
                    });
                }

                let matchResult = stdout.match(/百度为您找到相关结果约\s*(\S+)\s*个/g);
                matchResult = matchResult && matchResult[0];
                matchResult = matchResult.replace(/,/g, "").match(/\d+/);
                return resolve({
                    answer: answer,
                    matchNumber: matchResult ? Number(matchResult) : 0,
                });

            });
        });
    });

    Promise.all(promises).then(answerResult => {
        console.log('>>>>> A2 <<<<<');
        console.log("");

        const maxNumber = _.max(_.pluck(answerResult, 'matchNumber'));
        _.each(answerResult, i => {
            console.log(i.answer, i.matchNumber);
            console.log("-".repeat(Math.ceil(i.matchNumber / maxNumber * 50)));
            console.log("");
        });

        console.log("\n");
    });
}
