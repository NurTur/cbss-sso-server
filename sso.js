'use strict';

var path           = require('path');
var fs             = require('fs');
var express        = require('express');
var session        = require('express-session');
var cookieParser   = require('cookie-parser');
var exphbs         = require('express-handlebars');
var bodyParser     = require('body-parser');
var favicon        = require('serve-favicon');
var methodOverride = require('method-override');
var u = require('nodejs-utils');

// // Подключение модуля аутентификации через LDAP
// var ldapLogin = require('./sso-ldap-login');

// // // Модуль последних обновлений с LDAP
// var ldapUpdate = require('./sso-ldap-update');

// YAML config
var yaml_config = require('node-yaml-config');
var config = yaml_config.load(__dirname + '/sso_config.yml');
exports.config = config;
u.configureLogger(path.join(__dirname, 'log4js.json'))
var logger = u.logger


// настройка соединения с cbss-ticket.service
u.setHttpOptions(config.cbssTicketService);


// // Пакет для шифрования
var crypto = require('crypto'),
	algorithm = config.securityAlgorithm;

// URL домена, который выступает SSO центром
// var SSOdomain = config.SSOdomain;
var SSOdomain = '/';

// Путь до папки с аватарами
var avatarsPath = __dirname+'/public/avatars/';

// Создание аватара пользователя
var createAvatar = function(avatarBase64, login) {
	//var avatarHex = new Buffer(avatarBase64, 'base64').toString('hex');
	if (avatarBase64) {
		fs.writeFile(avatarsPath+login+'.png', avatarBase64, 'base64', function(err) { });
	}
	else {
		fs.createReadStream(avatarsPath+'no-photo.png').pipe(fs.createWriteStream(avatarsPath+login+'.png'));
	}
};

// Функция для кодирования токена (строки)
function encryptString(text, key){
	var cipher = crypto.createCipher(algorithm,key);
	try {
		var crypted = cipher.update(text,'utf8','hex');
		crypted += cipher.final('hex');
		return crypted;
	} catch (ex) {
		return false;
	}
}

// Функция для декодирования токена (строки)
function decryptString(text, key){
	var decipher = crypto.createDecipher(algorithm,key);
	try {
		var dec = decipher.update(text,'hex','utf8');
		dec += decipher.final('utf8');
		return dec;
	} catch (ex) {
		return false;
	}
}

// Пароль приходит в hex со спец. символами из HTML формы
//   Для дешифровки:
//   1) удаляются все спец. символы
//   2) hex преобразуется в ascii
function decryptPassFromForm(password) {
	var pass = password.replace(/[^a-zA-Z 0-9]+/g, '');
	pass = new Buffer(pass, 'hex').toString('ascii');
	return pass;
}

// functions
var executeQuery = function(queryStr, queryData, callback) {
    var request = u.getConnection();
    u.executeQuery(request, queryStr, queryData, callback);
};
exports.executeQuery = executeQuery;

//Преобразование ссылки в корректное доменное имя
const getCallbackUrl = url => {
	const matchArray = url.match(/(https?:\/\/[^\/\?]+)/)
	return matchArray && matchArray[1]
}

// Настройки Express
var app = express();
exports.app = app;

app.use(express.static(path.join(__dirname, '/public')));

app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(methodOverride());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true, parameterLimit:5000 })); // extended: false,
app.use(cookieParser());

// Движек: Express Handlebars
app.engine('handlebars', exphbs({defaultLayout: ''}));
app.set('views', __dirname + '/views');
app.set('view engine', 'handlebars');

// Данная сессия работает в связке с редактором ключей
app.use(session({
	secret: config.sessionSecret,
	resave: false,
	saveUninitialized: true
}));


// Получение общих переменных
app.use(function (req, res, next) {
	logger.info('In middleware - ', req.method, req.originalUrl);
	
	// Получение текущего IP адреса клиента
	var IP = req.headers['x-forwarded-for'] ||
		req.connection.remoteAddress ||
		req.socket.remoteAddress ||
		req.connection.socket.remoteAddress;

	// Unix Time (в секундах)
	var currentUnixTime = Math.floor(Date.now() / 1000);

	res.locals = {
		IP: IP,
		currentUnixTime: currentUnixTime
	};

	// set session
	if (!req.session.auth) {
		//req.session.auth = 0;
	}

	// Получаем пришедший URL сайта и смотрим если ли он у нас в БД
	var callbackUrl = ''
	if (req.query.callback_url) {
		callbackUrl = getCallbackUrl(req.query.callback_url)
	}
	else if (req.body.callback_url) {
		callbackUrl = getCallbackUrl(req.body.callback_url)
	}
	else {
		var callbackUrl = false;
	}
	res.locals.cryptoKey = false;
	res.locals.callbackUrl = false;

	logger.debug('callbackUrl: ', callbackUrl);

	if (callbackUrl) {
		executeQuery('SELECT * FROM projects WHERE project=?', [callbackUrl], function(err, row) {
			if (row[0]) {
				// Если проект есть в БД смотрим, используется ли ключ
				// Если да - то получаем ключ из БД, если нет - получаем false
				if (row[0].is_active == 1) {
					logger.info('callbackUrl is active');
					res.locals.cryptoKey = row[0].crypto_key;
					res.locals.callbackUrl = row[0].project;
					next();
				}
				else {
					logger.info('callbackUrl is not active');
					res.locals.cryptoKey = row[0].crypto_key;
					res.locals.callbackUrl = false;
					next();
				}
			}
			else {
				logger.info('No callbackUrl found');
				res.locals.cryptoKey = false;
				res.locals.callbackUrl = false;
				next();
			}
		});
	}
	else {
		logger.info('No callbackUrl specified');
		next();
	}
});

// Модуль editor (редактирование проектов и ключей доступа к ним)
// require('./sso-editor');

/////////////////////////////////////////////////////////////////////
// Начало роутов express
/////////////////////////////////////////////////////////////////////

// // API для проверки обновлений с таблицы обновлений (ldap_update) для конкретного пользователя
// // Если обновлений нет - то выводится ok
// // -> иначе выводится change
// app.get('/ldap-api', ldapUpdate.ldapApi);

// // Проверка обновлений в Active Directory (LDAP)
// // Производится запись в таблицу БД MySQL (ldap_update)
// app.get('/update-ldap', ldapUpdate.ldapUpdateTable);

// При обращении в корень SSO выведется сообщение со статусом 403
app.get('/', function (req, res) {
	res.status(403).render('index');
});

// Проверка, авторизован ли SSO центр. Если да -> перенаправление на нужный сайт с токеном
// Если SSO не авторизован - перенаправление на страницу [soo_domain]/login
app.get('/action/is-auth', function (req, res) {
	var callbackUrl = res.locals.callbackUrl;
	var autoAuth = req.query.auto_auth || false;
	
	logger.info(`In route:`)
	logger.debug(`res.locals.callbackUrl: `, res.locals.callbackUrl)
	
	// В случае, если callback_url отсутствует или его нет в конфиг. файле YAML
	// - то выводим ошибку ("Не указан ресурс, который нужно авторизовать")
	if (callbackUrl === false) {
		res.render('login', { isCallback: 'Need Callback URL' });
		return;
	}

	var typeRedirect = 0;
	if (req.cookies.sescookie) {
		var decryptedCookie = decryptString(req.cookies.sescookie, config.SSOCookieKey);

		if (decryptedCookie) {
			var cookieParams = decryptedCookie.split(';');

			var isValidCookie = cookieParams[0];
			var userData = JSON.parse(cookieParams[1]);

			// Информация о пользователе (ip при прошлой аутентификация и чужой компьютер или нет)
			var ipFromCookie = userData.ip;
			var isForeignComputer = userData.foreignComputer;

			if ((isValidCookie == 'cbs-auth') && (ipFromCookie == res.locals.IP)) {

				var tokenCollectString = 'cbs-auth;'+req.cookies.sescookie+';'+res.locals.currentUnixTime;
				var tokenEncryptString = encryptString(tokenCollectString, res.locals.cryptoKey);

				// Продлеваем cookie на SSO ещё на 14 дней если все ОК.
				if (isForeignComputer == 0) {
					var cookieTime = 1000*60*60*24*14;
					res.cookie('sescookie', req.cookies.sescookie, { maxAge: cookieTime, httpOnly: true });
				}

				// set session
				req.session.auth = 1;
				typeRedirect = 1;
			}
		}
	}
	
	logger.debug(`typeRedirect: `, typeRedirect, `autoAuth: `, autoAuth)
	
	// Если все в порядке с cookie -> производим перенаправление на нужный сайт
	// с целью авторизировать его
	if (typeRedirect == 1) {
		res.redirect(callbackUrl+'/auth?token='+tokenEncryptString);
	}
	else {
		(autoAuth) ? res.redirect(callbackUrl) :
		res.redirect(SSOdomain+'login?callback_url='+callbackUrl);
	}
});

// Выход из аутентификационного центра
app.get('/action/logout', function (req, res) {
	logger.info(' - ', req.method, req.hostname + req.originalUrl);
	
	var callbackUrl = res.locals.callbackUrl;
	req.session.auth = 0;
	res.clearCookie('sescookie');

	logger.debug('callbackUrl: ', callbackUrl);

	// Получение всех проектов из БД для организации выхода
	executeQuery('SELECT CONCAT(project, IFNULL(logout_path, \'\')) as project FROM projects WHERE is_active = \'1\';', [callbackUrl], function(err, rows) {
		if (rows) {
			var urlsArray = new Array;
			for(var i in rows) {
				urlsArray.push(rows[i].project);
			}

			if (callbackUrl) {
				res.render('login', { callbackUrl: callbackUrl, urls:urlsArray });
			}
			else {
				res.render('login', { callbackUrl: SSOdomain+'login', urls:urlsArray });
			}
		}
		else {
			res.redirect(SSOdomain+'login');
		}
	});

});

// Форма для авторизации пользователя
app.get('/login', function (req, res) {
	logger.info(' - ', req.method, req.hostname + req.originalUrl);

	var callbackUrl = res.locals.callbackUrl;
	var isSSOAuth = 0;

	// Если есть SSO cookie
	if (req.cookies.sescookie) {
		var decryptedCookie = decryptString(req.cookies.sescookie, config.SSOCookieKey);

		// Проверка cookie на валидность
		if (decryptedCookie) {
			if (decryptedCookie.match(/cbs-auth/)) {
				isSSOAuth = 1;

				var cookieParams = decryptedCookie.split(';');
				var userData = JSON.parse(cookieParams[1]);

				const avaName = (fs.existsSync(avatarsPath + userData.login + '.png')) ? userData.login : 'no-photo';

				var userInfo = {
					isAuth: 'ok',
					login: userData.login,
					avaName: avaName,
					name: userData.name,
					role: userData.role,
					department: userData.department.name,
					ssoDomain: SSOdomain
				};

			}
		}
	}

	logger.debug('isSSOAuth: ', isSSOAuth);

	// Если мы аутентифицированы - мы получаем сообщение "SSO аутентифицирован"
	if (isSSOAuth == 1) {
		res.render('login', userInfo);
	}
	else {
		if (req.query.callback_url && (callbackUrl == false)) {
			res.render('login', { isCallback: 'Need Callback URL' });
		}
		else if (req.query.callback_url && callbackUrl) {
			res.render('login', { callbackUrl: callbackUrl });
		}
		else {
			res.render('login', { callbackUrl: '' });
		}
	}
});

// POST запрос из формы /login. Проверяем все данные, ставим cookie на SSO,
// делаем перенаправление с токеном на нужный сайт
app.post('/auth', function (req, res) {
	var callbackUrl = res.locals.callbackUrl;

	if (!req.body.login || !req.body.password) {
		res.status(403).render('status403', { SSOdomain: SSOdomain });
		return;
	}
	else if (req.body.login.length>60 || req.body.password.length>60) {
		res.status(403).render('status403', { SSOdomain: SSOdomain });
		return;
	}

	// Получаем POST данные из формы
	var login = req.body.login;
	var password = decryptPassFromForm(req.body.password);
	var foreignComputer = req.body.foreign_computer;  // Чужой компьютер или нет

	foreignComputer = (foreignComputer=='on') ?
					  foreignComputer=1 :
					  foreignComputer=0;


	// Подключение к LDAP (пока не используется)
	//ldapLogin.LDAPconnect(login, password, function(status, userData){

	var authRoute = 'users/autorize?login='+encodeURIComponent(login.trim())+'&password='+encodeURIComponent(password);

	// Обращение на TicketService
	u.httpGet(authRoute, function (err, result) {
		if (err) {
			res.status(500).send('Ticket service unavailable');
		} else {
			if (result.statusCode == 200) {
				// Сессия для редактора ключей
				req.session.auth = 1;

				// Создание аватара (пока не используется)
				// createAvatar(userData.avatarBase64, userData.login);

				// Временная проверка есть ли роль (пока не используется)
				// Если её нет - перебрасывание на страницу в ошибкой
				// if (userData.role == '') {
				// 	res.redirect(SSOdomain+'no-role');
				// 	return;
				// }

				// var userDataCookie = {
				// 	"login": userData.login,
				// 	"name": userData.name,
				// 	"role": userData.role,
				// 	"department": userData.department,
				// 	"ip": res.locals.IP,
				// 	"foreignComputer": foreignComputer
				// };
				
				
				
				var userDataCookie = result.response
				userDataCookie.foreignComputer = foreignComputer;
				userDataCookie.ip = res.locals.IP;

				userDataCookie = JSON.stringify(userDataCookie);

				var compareCookieStr = 'cbs-auth;'+userDataCookie;
				var cookieEncrypt = encryptString(compareCookieStr, config.SSOCookieKey);

				// Проверка чужой ли компьютер
				// Если да - сессии и куки удалятся после закрытия браузера
				// Если нет - будет автопродление на 2 недели вперед
				if (foreignComputer == 1) {
					res.cookie('sescookie', cookieEncrypt, { httpOnly: true });
				}
				else {
					var cookieTime = 1000*60*60*24*14; // 14 дней
					res.cookie('sescookie', cookieEncrypt, { maxAge: cookieTime, httpOnly: true });
				}

				if (callbackUrl) {
					// Генерация токена перед отправкой на нужный сайт
					var tokenCollectString = 'cbs-auth;'+cookieEncrypt+';'+res.locals.currentUnixTime;
					var tokenEncryptString = encryptString(tokenCollectString, res.locals.cryptoKey);

					// Отправка токена на сайт, который нужно аутентифицировать
					// Также будут автоматически аутентифицированы и другие сайты
					logger.info(`callbackUrl:`, callbackUrl)
					res.redirect(callbackUrl+'/auth?token='+tokenEncryptString);
				}
				else {
					// Возвращение на страницу авторизации
					res.redirect(SSOdomain+'login');
				}
			}
			else {
				// Ошибка 403: Доступ запрещен (неверные логин или пароль)
				res.status(403).render('status403', { SSOdomain: SSOdomain });
			}
		};
	});
});

// express Error handling
app.use(function(err, req, res, next) {
    logger._error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(process.env.PORT || config.server.port, function() {
  logger.info('Express listening on port ', process.env.PORT || config.server.port);
  // Подключение к MySQL
  u.mysqlDBConnect({
  	user     : config.db.user,
    password : config.db.password,
    host     : config.db.host,
    database : config.db.database,
    multipleStatements: true
  }, function() {

  });
});
