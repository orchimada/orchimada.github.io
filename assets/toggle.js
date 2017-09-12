$( document ).ready(function() {
    console.log( "ready!" );
});

function myFunction() {
    var books = document.getElementById('book_list');
    if (books.style.display === 'none') {
        books.style.display = 'block';
    } else {
        books.style.display = 'none';
    }
}