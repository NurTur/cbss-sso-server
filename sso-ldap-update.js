//var express        = require('express');
var ldap   = require('ldapjs');
var mysql  = require('mysql');
var _      = require('lodash');
var crypto = require('crypto');

// YAML config
var yaml_config = require('node-yaml-config');
var config = yaml_config.load(__dirname + '/sso_config.yml');

// Подключение к MySQL
var db = mysql.createConnection({
	host     : config.db.host,
	user     : config.db.user,
	password : config.db.password,
	database : config.db.database
});
db.connect();

// LDAP настройки
var client = ldap.createClient({
	url: 'ldap://'+config.ldap.server
});

module.exports = {
	// Проверка обновлений в Active Directory (LDAP)
	// Производится запись в таблицу БД MySQL (ldap_update)
    ldapUpdateTable: function(req, res) {
		var opts = {
			filter: config.ldap.updateFilter, // (mail=*)
			scope: 'sub',
			attributes: ['cn', 'department', 'memberOf']   // title
		};
		var searchBase = config.ldap.updateSearchBase;

		client.bind('rkuterev@cbs.kz', 'rku6745!', function(client_err) {
			if(client_err) {
				res.send('Connection error');
			} else {
				// Удаление старых данных
				db.query('TRUNCATE ldap_update', function(err, result) { });

				client.search(searchBase, opts, function(err, resList) {
					var count = 0;
					resList.on('searchEntry', function(entry) {
						var entryData = entry.toString();

						// From Almaty (objectCategory='CN=Person', but it's not a active person or person)
						var removeOU = ['OU=Shared resources', 'OU=Contacts', 'OU=Disabled Users', 'OU=Test Users'];
						var regexFromMyArray = new RegExp(removeOU.join("|"), 'gi');

						var matches = entryData.match(regexFromMyArray) || [];
						if (matches.length == 0) {
							count = count+1;
							var data = entry.attributes;
							var insertObj = {};
							var sumData = '';

							for(i in data) {
								if (data[i].type == 'memberOf') {
									insertObj[data[i].type] = '';
									sumData += '';

									_(data[i].vals).forEach(function(valueRole) {
										if (valueRole.match(/OU=Application Gro/)) {
											insertObj[data[i].type] = valueRole.split(',')[0].replace('CN=','');
											sumData += valueRole.split(',')[0].replace('CN=','');
										}
									});
								}
								else {
									insertObj[data[i].type] = data[i].vals[0];
									sumData += data[i].vals[0];
								}
								// Если объект сформировался
								if (i == (data.length-1)) {
									// Последовательность суммирования параметров из LDAP:
									// md5(cn, title, department)
									insertObj['hash_data'] = crypto.createHash('md5').update(sumData).digest("hex");

									db.query('INSERT INTO ldap_update SET ?', insertObj, function(err, result) {
										if (err) {
											console.log(err);
										}
									});

								}
							}
						}
					});
				});
				res.send('ok');
			}
		});
	},

	// API для проверки обновлений с таблицы обновлений (ldap_update) для конкретного пользователя
	// Если обновлений нет - то выводится ok
	// -> иначе выводится change
	ldapApi: function(req, res) {
		if (req.query.uid) {
			var uid = req.query.uid;

			// Получение всех проектов из БД для организации выхода
			db.query('SELECT hash_data FROM ldap_update where hash_data="'+uid+'"', function(err, row) {
				if (row[0]) {
					res.send('ok');
				}
				else {
					res.send('change');
				}
			});
		}
		else {
			res.send('Error. Bad params.');
		}
	}
}
