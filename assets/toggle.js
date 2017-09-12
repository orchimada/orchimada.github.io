$( document ).ready(function() {
    console.log( "ready!" );
});

$(document).on("click", '#books_switch', function() {
    console.log( "found" );
    var books = $('#book_list');
    if (books.style.display === 'none') {
        books.style.display = 'block';
    } else {
        books.style.display = 'none';
    }
});

