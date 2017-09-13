$( document ).ready(function() {
    console.log( "ready!" );
    $('#books_list').hide();
    $('#tools_list').hide();
    $('#projects_list').hide();
});

$(document).on("click", '#projects_switch', function() {
    console.log( "found" );
    $('#books_list').hide();
    $('#tools_list').hide();
    $('#projects_list').show();
});

$(document).on("click", '#books_switch', function() {
    console.log( "found" );
    $('#books_list').show();
    $('#tools_list').hide();
    $('#projects_list').hide();
});

$(document).on("click", '#tools_switch', function() {
    console.log( "found" );
    $('#books_list').hide();
    $('#tools_list').show();
    $('#projects_list').hide();
});


