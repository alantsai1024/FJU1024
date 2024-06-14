const express = require('express');
const fs = require('fs');
const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const cookieParser = require('cookie-parser');
const arr = [];
const session = require('express-session');
const app = express();
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'hbs');
app.use(cookieParser());
async function myFunction(accountnumber, password) {
    let options = new chrome.Options();
    options.addArguments('headless');
    options.addArguments('disable-gpu');
    options.addArguments('no-sandbox');
    let driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    await driver.get('http://estu.fju.edu.tw/CheckSelList/HisListNew.aspx');
    const userxpath = await driver.findElement({ xpath: '//*[@id="TxtLdapId"]' });
    const passwordxpath = await driver.findElement({ xpath: '//*[@id="TxtLdapPwd"]' });
    const loginxpath = await driver.findElement({ xpath: '//*[@id="ButLogin"]' });
    await userxpath.sendKeys(accountnumber);
    await passwordxpath.sendKeys(password);
    await loginxpath.click();
    await driver.sleep(1000);
    const mylessonxpath = await driver.findElement({ id: 'GV_NewSellist' });
    const mylesson = await mylessonxpath.getText();
    return mylesson;
}

app.get('/', (req, res) => {
    res.render('index');
});

app.post('/login', async (req, res) => {
    const { accountnumber, password } = req.body;
    try {
        const mylesson = await myFunction(accountnumber, password);
        const arrforlesson = [];
        mylesson.split('\n').forEach((element) => {
            if (element === "NO 課程標記 學年度 學期 課程代碼 主開課程碼 開課單位名稱 科目名稱 學分 開課選別 學生選課設定選別 期次 授課教師 星期 週別 節次 教室 星期 週別 節次 教室 星期 週別 節次 教室 通識領域 備註") {
                return;
            } else {
                arrforlesson.push(element);
                const lastelementof = arrforlesson[arrforlesson.length - 1];
                arr.push(lastelementof);
            }
        });

        // 異步寫入檔案，避免沒寫完就跳轉頁面
        await new Promise((resolve, reject) => {
            //寫到lesson資料夾裡面利用path
            fs.writeFile(`./lesson/${accountnumber}.json`, JSON.stringify(arr), (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        res.cookie('accountnumber', accountnumber, { maxAge: 1000 * 60 * 60 });
        res.redirect('/results');

    } catch (err) {
        console.error('Error in login route:', err);
        res.status(500).render('index', { message: '帳號或密碼錯誤' });
    }
});

app.get('/results', async (req, res) => {
    try {
        const user = req.cookies.accountnumber;

        if (!user) {
            return res.redirect('/');
        }
        const data = await fs.promises.readFile(`./lesson/${user}.json`, 'utf8');
        const arr = JSON.parse(data);
        const rawCourseData = [...arr];  //深拷貝

        const parseCourseData = (data) => {
            const courses = [];
            for (let i = 0; i < data.length; i += 4) {
                const course = {
                    "課程名稱": data[i + 2],
                    "上課時間": data[i + 3].replace(/DN-D6/g, 'D4-D7').replace(/D7-D8/g, 'D8-D9').replace(/D5-D6/g, 'D6-D7').replace(/D5-D7/g, 'D6-D8').replace(/D5-D6/g, 'D6-D7').match(/(一|二|三|四|五) 全 (D[1-9])-?(D[1-9])?/) || data[i + 3].replace(/DN-D6/g, 'D4-D7').replace(/D7-D8/g, 'D8-D9').replace(/D5-D6/g, 'D6-D7').replace(/D5-D7/g, 'D6-D8').replace(/D5-D6/g, 'D6-D7').match(/(一|二|三|四|五) 單 (D[1-9])-?(D[1-9])?/) || data[i + 3].replace(/E0/g, 'D9').match(/(一|二|三|四|五) 全 (E[0-9])-?(E[0-9])?/),
                    "上課教室": data[i + 3].match(/([A-Z]{2}\d{3}[A-Z]?)/)?.[0] || '',
                };
                if (course.上課時間) {
                    courses.push({
                        "課程名稱": course.課程名稱,
                        "星期": course.上課時間[1],
                        "開始節次": course.上課時間[2],
                        "結束節次": course.上課時間[3],
                        "教室": course.上課教室,

                    });
                }
            }
            return courses;
        };

        const courseData = parseCourseData(rawCourseData);

        const createTimetableHTML = (courses) => {
            const days = ['一', '二', '三', '四', '五', '六'];
            const periods = [
                "第 1 節<br><br>08:10 ~ 09:00",
                "第 2 節<br><br>09:10 ~ 10:00",
                "第 3 節<br><br>10:10 ~ 11:00",
                "第 4 節<br><br>11:10 ~ 12:00",
                "<br> DN <br><br>12:10 ~ 13:00  <br><br> or <br><br> 12:40 ~ 13:30",
                "第 5 節<br><br>13:40 ~ 14:30",
                "第 6 節<br><br>14:40 ~ 15:30",
                "第 7 節<br><br>15:40 ~ 16:30",
                "第 8 節<br><br>16:40 ~ 17:30",
                "第 9 節<br><br>17:40 ~ 18:30",
            ];

            let tableHTML = `<table border="1" style='position: absolute; top:50%;left:50%;transform: translate(-50%,-50%)'>
      <thead>
        <tr>
          <th>節\\日</th>
          ${days.map(day => `<th>星期${day}</th>`).join('')}
        </tr>
      </thead>
      <tbody>`;

            for (let i = 1; i < periods.length; i++) {
                tableHTML += `<tr style='text-align:center;'>
        <td>${periods[i - 1]}</td>`;
                for (let j = 0; j < days.length; j++) {
                    const day = days[j];
                    const period = `D${i}`;


                    const course = courses.find(c => c.星期 === day && c.開始節次 <= period && c.結束節次 >= period);


                    tableHTML += `<td>`;

                    if (course) {
                        tableHTML += `${course.課程名稱}<br>${course.教室}`;
                    }

                    tableHTML += `</td>`;
                }
                tableHTML += `</tr>`;
            }

            tableHTML += `</tbody></table>`;
            return tableHTML;
        };
        const timetableHTML = createTimetableHTML(courseData);
        res.render('results', { data: timetableHTML, user });
        console.log('課表已經成功生成！');


    } catch (err) {
        console.error('Error reading file or rendering results:', err);
        res.status(500).send('伺服器法生錯誤，請稍後再試一次！');
    }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
