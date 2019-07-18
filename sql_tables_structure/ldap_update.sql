CREATE TABLE IF NOT EXISTS `ldap_update` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `cn` varchar(100) NOT NULL,
  `department` varchar(100) DEFAULT NULL,
  `title` varchar(150) DEFAULT NULL,
  `hash_data` varchar(200) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cn` (`cn`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8;