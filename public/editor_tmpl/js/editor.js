// Generate 5 digits number
function randomKey() {
	return (Math.floor(Math.random()*90000) + 10000);
}

// Is CBSAuth Module Running?
function isCBSAuthRunning(url, id) {
	$.ajax({
		type: 'GET',
		url: url+"is-running",
		success: function(data) {
			$('#res'+id).css('background', 'url(/editor_tmpl/img/sprite.png) no-repeat -10px -7px');
			$('#res'+id).addClass('hint--top').attr('data-hint', 'Модуль используется');
		},
		error: function(){
			$('#res'+id).css('background', 'url(/editor_tmpl/img/sprite.png) no-repeat -32px -7px');
			$('#res'+id).addClass('hint--top').attr('data-hint', 'Модуль не используется (невозможно подключиться)');
		}
	});
}

// Is CBSAuth Module Running (each all)
$('.edit[field="project"]').each(function() {
	var url = $(this).val();
	var id = $(this).attr('db-id');
	isCBSAuthRunning(url, id);
});

// Adding a new project
$('.add_project').click(function() {
	// Открытие окна
	$('.display_form').fadeIn(300);
	$('.add_form').fadeIn(300);

	$('#project').val('http://example.com/');
	$('#crypto_key').val('cbs-sso-key-'+randomKey());

	// Generate key
	$('#generate').click(function() {
		$('#crypto_key').val('cbs-sso-key-'+randomKey());
	});

	// Close a window
	$('#close').click(function() { $('.add_form').fadeOut(200); $('.display_form').fadeOut(200); });
	$(document).keyup(function(e) { 
		if (e.keyCode === 27) {
			$('.add_form').fadeOut(200);
			 $('.display_form').fadeOut(200);
		}
	});

	// Add button click
	$("#add").on("click", function(e) {
		e.stopImmediatePropagation();
		
		$('.add_form').fadeOut().siblings('.display_form').fadeOut(function() {
			
			$.ajax({
				url: '/editor/add',
				type: 'POST',
				data: { 'project':$('#project').val(), crypto_key:$('#crypto_key').val() },
				success: function (insertMessage) {
					
					if (insertMessage == 'cant insert') {
						alert('Ошибка! Такой проект уже есть.');
					}
					else {
						var insertId = insertMessage;

						isCBSAuthRunning($('#project').val(), insertId);

						// New row in a table
						var str = '<tr id="db'+insertId+'">'+
						'<td><div id="res'+insertId+'" class="circle"></div></td>'+
						
						'<td><div class="is_active ok hint--top" db-id="'+insertId+'" status="0" data-hint="Ключ используется"></div></td>'+
						
						'<td><span class="display">'+$('#project').val()+'</span>'+
						'<input type="text" class="edit" db-id="'+insertId+'" field="project" value="'+$('#project').val()+'"></td>'+
						
						'<td><span class="display">'+$('#crypto_key').val()+'</span>'+
						'<input type="text" class="edit" db-id="'+insertId+'" field="crypto_key" value="'+$('#crypto_key').val()+'"></td>'+
						
						'<td><div class="delete hint--top" data-hint="Удалить проект" db-id="'+insertId+'"></div></td></tr>';
						
						$("#projects").append(str);

						// Clear form
						$('#project').val('');
						$('#crypto_key').val('');
					}
				}
			});
		});
	});
});

// Is key active? (0 or 1 value)
$('#projects').on('click', '.is_active', function(){
	var $button = $(this);
	$.ajax({
		url: '/editor/is_active',
		type: 'PUT',
		data: { 'id':$button.attr('db-id'), is_active: $button.attr('status') },
		success: function (result) {
			if ($button.attr('status') === '1') {
				$button.attr('status', '0').removeClass('not_ok').addClass('ok');
				$button.attr('data-hint', 'Ключ используется');
			}
			else if ($button.attr('status') === '0') {
				$button.attr('status', '1').removeClass('ok').addClass('not_ok');
				$button.attr('data-hint', 'Ключ не используется');
			}
		}
	});
});

// Delete a project
$('#projects').on('click', '.delete', function(){
	var id = $(this).attr('db-id');

	if (confirm("Удалить проект?")) {
		$.ajax({
		url: '/editor/delete/'+id,
		type: 'DELETE',
		success: function(result) {
			$('#db'+id).fadeOut();
		}
		});
	}
});

// Edit a current field value
$('#projects').on('click', '.display', function(){
	$(this).hide().siblings(".edit").show().val($(this).text()).focus();

	$(".edit").change(function(){
		if ($(this).attr('field') == 'project') {
			var DBinsertID = $(this).attr('db-id');
			var newProjectURL = $(this).val();
		}

		$(this).focusout(function(e){
			e.stopImmediatePropagation();
			$.ajax({
				url: '/editor/edit',
				type: 'PUT',
				data: { 'id':$(this).attr('db-id'), field: $(this).attr('field'), fieldValue: $(this).val() },
				success: function (result) {
					if (newProjectURL) {
						isCBSAuthRunning(newProjectURL, DBinsertID);
					}
				}
			});
			$(this).hide().siblings(".display").fadeIn().text($(this).val());
			$(this).unbind();
		});
	}).focusout(function(e){
		$(this).hide().siblings(".display").fadeIn().text($(this).val());
	});
});