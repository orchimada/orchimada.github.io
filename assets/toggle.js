$( document ).ready(function() {
    console.log( "ready!" );
});

$( '#books_switch' ).onclick(function() {
    console.log( "found" );
});

function myFunction() {
    var books = document.getElementById('book_list');
    if (books.style.display === 'none') {
        books.style.display = 'block';
    } else {
        books.style.display = 'none';
    }
}