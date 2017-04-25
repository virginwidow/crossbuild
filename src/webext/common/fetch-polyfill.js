class awaitable {
    constructor(xhr) {
        this.xhr = xhr;
    }
    json() {
        return new Promise(resolve => resolve(JSON.parse(this.xhr.responseText)))
    }
    text() {
        return new Promise(resolve => resolve(this.xhr.responseText))
    }
}
export default function fetch(url) {
    return new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => {
            // console.log(xhr.responseText);
            resolve(new awaitable(xhr));
        };
        xhr.open("GET", url);
        xhr.send();
    })
}