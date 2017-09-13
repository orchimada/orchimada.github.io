$( document ).ready(function() {
    console.log( "ready!" );
});

$(document).on("click", '#books_switch', function() {
    console.log( "found" );
    $('#book_list').classList.toggle('menuStyle');
});

