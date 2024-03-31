const createSession = (login, db) => {
    const token = String(Number.parseInt(Math.random()*99999999999))
    db.run(`DELETE from sessions WHERE login = '${login}'`)
    db.run(
        'INSERT INTO sessions(login, token) VALUES(?,?)',
        [login, token],
        (err) => {if (err) { return console.error(err)}}
    )
    return token
}

const currencyDictionary = {
    maxcoins: 'Макскоинов',
    nissomani: 'Ниссомани',
    piski: 'Дичек',
    ilushekels: 'Илюшекелей',
    rudies: 'Рудий',
}

const rarityWeights = {
  trash: 60,
  common: 25,
  rare: 10,
  epic: 5,
  legendary: 1
}

module.exports = {createSession, currencyDictionary, rarityWeights}