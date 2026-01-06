let serviceForm = document.getElementById("Service");
serviceForm.style.display = 'none';

let carWrenchIcon = document.querySelector('.fa-car-wrench');


const serviceDiv = document.getElementById("Service");   // the container with id="Service"
const inputs = serviceDiv.querySelectorAll("input");     // all inputs inside that div



carWrenchIcon.addEventListener('click', ()=>{
    if (serviceForm.style.display === 'none') {
        serviceForm.style.display = 'block';
        carWrenchIcon.style.color = 'red';

        inputs.forEach(input => {
            input.style.border = "2px solid red";
          });          

    } else {
        serviceForm.style.display = 'none';
        carWrenchIcon.style.color = '';

    }
})