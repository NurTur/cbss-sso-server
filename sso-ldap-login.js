// var ldap = require('ldapjs');
var _    = require('lodash');

// YAML config
var yaml_config = require('node-yaml-config');
var config      = yaml_config.load(__dirname + '/sso_config.yml');


// LDAP настройки
var client = ldap.createClient({
	url: 'ldap://'+config.ldap.server
});

// Функция, для подключения к LDAP
var LDAPconnect = function(login, password, callback) {

	if (!login.match(/@cbs.kz/)) {
		login = login+'@cbs.kz';
	}

	var opts = {
		filter: '(mail='+login+')', // '(mail='+login+')' / mail=dschelkunov@cbs.kz
		scope: 'sub',
		attributes: ['cn', 'company', 'department', 'co', 'thumbnailphoto', 'memberOf', 'title', 'mail', 'manager']
	};
	var searchBase = config.ldap.loginSearchBase;


	client.bind(login, password, function(client_err) {
		if(client_err) {
			callback(false);
		} else {
			
			// Если пользователь смог аутентифицироваться - получаем атрибуты
			client.search(searchBase, opts, function(search_err, search_res) {
				search_res.on('searchEntry', function(entry) {
					var	data = entry.attributes;
					var role, name, department = '', avatarBase64 = undefined;

					for(i in data) {
						// Атрибут cn = имя пользователя
						if (data[i].type == 'cn') {
							name = data[i].vals[0];
						}

						// Атрибут memberOf = специальность
						if (data[i].type == 'memberOf') {
							
							// На данный момент нет для каких-то пользователей ролей
							role = '';

							_(data[i].vals).forEach(function(valueRole) {
								if (valueRole.match(/OU=Application Gro/)) {
									role = valueRole.split(',')[0].replace('CN=','');
								}
							});
						}

						// Фото пользователя
						if (data[i].type == 'thumbnailPhoto') {
							avatarBase64 = entry.attributes[8].buffers[0].toString('base64');
						}

						// Отдел
						if (data[i].type == 'department') {
							department = data[i].vals[0];
						}

					}

					// Объект с параметрами пользователя
					var userData = {
						login: _.replace(login, '@cbs.kz', ''),
						name: name,
						role: role,
						department: department,
						avatarBase64: avatarBase64
					};

					callback(true, userData);

				});
			});

		}
	});
};

module.exports.LDAPconnect = LDAPconnect;