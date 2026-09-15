/* =================================
   COLORES ALEATORIOS PARA BOTONES GRISES
   Cada vez que se carga la página, todos los
   botones con la clase "btn-color-aleatorio"
   (los que antes eran siempre grises) reciben
   un color distinto tomado al azar.
================================= */

(function () {

    const PALETA = ["primary", "success", "danger", "warning", "info"];

    function colorAleatorio() {
        return PALETA[Math.floor(Math.random() * PALETA.length)];
    }

    document.addEventListener("DOMContentLoaded", () => {

        document.querySelectorAll(".btn-color-aleatorio").forEach((boton) => {
            boton.classList.remove("btn-outline-secondary");
            boton.classList.add("btn-outline-" + colorAleatorio());
        });

    });

})();
