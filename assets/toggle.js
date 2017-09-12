console.log('it works');

function myFunction() {
    var books = document.getElementById('book_list');
    if (books.style.display === 'none') {
        books.style.display = 'block';
    } else {
        books.style.display = 'none';
    }
}