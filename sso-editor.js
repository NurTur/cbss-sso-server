'use strict';

var index  = require('./sso'),
	app    = index.app,
	config = index.config,
	executeQuery = index.executeQuery;

/////////////////////////////////////
// Функции для взаимодействия с БД
/////////////////////////////////////

// Добавление нового проекта (с новым ключом шифрации)
var dbAddProject = function(insertData, callback) {
	executeQuery('INSERT INTO projects SET ?', insertData, function(err, result) {
		callback(err, result);
	});
};

// Получение данных о проекте (проект, ключ шифрации)
var dbGetAllProjects = function(callback) {
	executeQuery('SELECT * FROM projects', [], function(err, rows) {
		callback(err, rows);
	});
};

// Получение данных о проекте (проект, ключ шифрации)
var dbGetProject = function(id, callback) {
	executeQuery('SELECT * FROM projects WHERE id=?', [id], function(err, row) {
		callback(err, row[0]);
	});
};

// Редактирование данных о проекте
var dbEditProject = function(id, field, fieldValue, callback) {
	executeQuery('UPDATE projects SET ?=? WHERE id=?', [field, fieldValue, id], function(err, result) {
		if (err) throw err;
		callback(err, result.affectedRows);
	});
};

// Установка проекта в активный или неактивный статус
var dbSetIsActiveProject = function(id, is_active, callback) {
	executeQuery('UPDATE projects SET is_active=? WHERE id=?', [is_active, id], function(err, result) {
		if (err) throw err;
		callback(err, result.affectedRows);
	});
};

// Удаление проекта (ключ шифрации)
var dbDeleteProject = function(id, callback) {
	executeQuery('DELETE FROM projects WHERE id=?', [id], function(err, result) {
		if (err) throw err;
		callback(err, result.affectedRows);
	});
};

app.use(function (req, res, next) {
	if (req.url.match(/editor/)) {
		if (req.session.auth == 1) {
			next();
		}
		else {
			res.send('Нет доступа к редактору. Пожалуйста, пройдите аутентификацию.');
		}
	}
	else {
		next();
	}
});

// Вывод списка проектов с ключами шифрации
app.get('/editor', function (req, res) {
	var project = req.query.project;
	dbGetAllProjects(function(err, rows){
		if (rows.length) {
			res.render('editor', { projects: rows });
		}
		else {
			res.send('No rows in a table');
		}
	});

});

// Изменение параметра активности проекта (ключа)
app.put('/editor/is_active', function (req, res) {
	dbSetIsActiveProject(req.body.id, req.body.is_active, function(err, result){
		if (result) {
			res.send('ok');
		}
		else {
			res.send('error');
		}
	});

});

// Добавление нового проекта
app.post('/editor/add', function (req, res) {
	var insertData = {
		project: req.body.project,
		crypto_key: req.body.crypto_key,
		is_active: 1
	};

	dbAddProject(insertData, function(err, result){
		if (result) {
			res.send(result.insertId.toString());
		}
		else {
			res.send('cant insert');
		}
	});
});

// Изменение определенного значения в записи таблицы.
// Например, project = [new url]
app.put('/editor/edit', function (req, res) {
	dbEditProject(req.body.id, req.body.field, req.body.fieldValue, function(err, result){
		if (result) {
			res.send('ok');
		}
		else {
			res.send('error');
		}
	});
});

// Удаление id проекта из таблицы
app.delete('/editor/delete/:id', function (req, res) {
	dbDeleteProject(req.params.id, function(err, result){
		if (result) {
			res.send('ok');
		}
		else {
			res.send('error');
		}
	});
});