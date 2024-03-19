const express = require('express')
const cors = require('cors')
const sqlite3 = require('sqlite3').verbose()
const {createSession, currencyDictionary}  = require('./utils') 

const db = new sqlite3.Database(
    './test.db', 
    sqlite3.OPEN_READWRITE, 
    (err) => {if (err) { return console.error(err)}
})

const manageCurrentUser = (token, res, cb) => {
    db.get(`SELECT * from sessions WHERE token='${token}'`,(err, session) => {
        if (err) { return console.error(err)}
        if (session) { 
            db.get(`SELECT * from users WHERE login='${session.login}'`,(err, user) => {
                if (err) { return console.error(err)}
                cb(user)
            })
        } else {
            res.status(403).send({message: 'Недоступно'})
        }
    })
} 


//db.run('CREATE TABLE users(id INTEGER PRIMARY KEY, login, password, maxcoins, nissomani, piski, ilushekels, rudies )')
//db.run('CREATE TABLE sessions(id INTEGER PRIMARY KEY, login, token)')
//db.run('CREATE TABLE sessions(id INTEGER PRIMARY KEY, login, token)')
//db.run('DROP TABLE users')

const app = express()
const port = 8081

app.use(express.json())
app.use(cors())

app.listen(port, () => {
    console.log('Работаем на порте ' + port)
})


app.get('/users', (req, res) => {
    db.all(`SELECT login, id FROM users`,(err, rows) => {
        if (err) { return console.error(err)}
        res.status(200).send(rows)
    })
})

app.get('/me', (req, res) => {
    const token = req.get('token')

    manageCurrentUser(token, res, (user) => {
        if (user) { 
            res.status(200).send(user)
        } else {
            res.status(403).send({message: 'Недоступно'})
        }
    })
})

app.post('/login', (req, res) => {
    const {login, password} = req.body
    console.log('Логинимся ' + login)
    db.get(`SELECT * from users WHERE login='${login}' And password='${password}'`,(err, row) => {
        if (err) { return console.error(err)}
        if (row) { 
            const token = createSession(row.login, db)
            console.log('Норм')
            res.status(200).send({ token })
        } else {
            res.status(403).send({message: 'Неверный логин или пароль'})
        }
    })

})

app.post('/user', async (req, res) => {
    const {login, password, confirmPassword} = req.body

    if (password !== confirmPassword) {
        console.log(`Пароль не совпадает`);
        res.status(400).send({message: 'Пароль не совпадает'})
        return
    }

    db.get(`SELECT * from users WHERE login='${login}'`,(err, row) => {
        if (err) { return console.error(err)}
        if (row) { 
            console.log(`Такой пользователь уже есть `, row);
            res.status(400).send({message: 'Такой пользователь уже есть'})
        } else {
            db.run(
                'INSERT INTO users(login, password, maxcoins, nissomani, piski, ilushekels, rudies) VALUES(?,?,?,?,?,?,?)',
                [login, password, 1000, 100, 100, 100, 100],
                (err) => {if (err) { return console.error(err)}}
            )
            const token = createSession(login, db)
            res.status(200).send({ token })
        }
    })
})

app.put('/transite', (req, res) => {
    const token = req.get('token')
    const {recieverId, sum, currency} = req.body

    manageCurrentUser(token, req, (giver) => {
        if (giver) {
            db.get(`SELECT * from users WHERE id='${recieverId}'`,(err, reciever) => {
                if (err) { return console.error(err)}
                if (reciever) {
                    db.run(`UPDATE users SET ${currency} = ? WHERE id = ?`, [reciever[currency] + sum, recieverId])
                    db.run(`UPDATE users SET ${currency} = ? WHERE id = ?`, [giver[currency] - sum, giver.id])
                    console.log(`${giver.login} переводит ${reciever.login} ${sum} ${currencyDictionary[currency]}`)

                    res.status(200).send('ok')
                } 
            })
        } 
    })
})