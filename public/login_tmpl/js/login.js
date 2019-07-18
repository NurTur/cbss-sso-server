function enc(s) {
	var p = "+_=-)(*&^%$#@!~[];";
	var h = '';
	for(var i=0;i<s.length;i++) {
		h += ''+s.charCodeAt(i).toString(16)+p.charAt(Math.floor(Math.random() * p.length));
	}
	return h;
}

$("form").submit(function(e) {
	var $pass = $(this).find("input[name=pass_val]");
	$(this).find("input[name=password]").val(enc($pass.val()));
	$pass.val('');
});