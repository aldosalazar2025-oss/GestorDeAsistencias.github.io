/* ==========================================================
   TABLAS RESPONSIVAS — sitio completo
   ---------------------------------------------------------
   En pantallas angostas (ver css/estilos.css, breakpoint 768px)
   toda tabla con clase .table se convierte en una lista de
   tarjetas "etiqueta: valor" en vez de desbordarse con scroll
   horizontal. Este script solo copia el texto de cada <th> al
   atributo data-label del <td> correspondiente, que es lo que
   el CSS necesita para poder mostrarlo con ::before.

   Es un script sin dependencias que se incluye igual en todas
   las páginas (dashboard, reportes, usuarios, escáner, etc.),
   sin importar si la tabla ya viene en el HTML o si el propio
   JS de la página la arma dinámicamente con onSnapshot/innerHTML:
   el MutationObserver detecta cualquiera de los dos casos.
========================================================== */

(function () {

    function etiquetarFilas(tabla) {

        const encabezados = Array.from(tabla.querySelectorAll(":scope > thead th"))
            .map((th) => th.textContent.trim());

        if (encabezados.length === 0) return;

        tabla.querySelectorAll(":scope > tbody > tr").forEach((fila) => {
            Array.from(fila.children).forEach((celda, i) => {
                if (encabezados[i] && !celda.hasAttribute("data-label")) {
                    celda.setAttribute("data-label", encabezados[i]);
                }
            });
        });

    }

    function etiquetarTodas() {
        document.querySelectorAll("table.table").forEach(etiquetarFilas);
    }

    etiquetarTodas();

    // Las tablas de este sistema se repueblan solas (Firestore en
    // tiempo real, resultados de reportes, búsquedas, etc.), así que
    // se vuelve a etiquetar cada vez que cambia el DOM. Se agrupan los
    // cambios con requestAnimationFrame para no repetir el trabajo
    // muchas veces por segundo cuando llegan varios cambios seguidos.
    let pendiente = false;

    const observador = new MutationObserver(() => {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(() => {
            etiquetarTodas();
            pendiente = false;
        });
    });

    observador.observe(document.body, { childList: true, subtree: true });

})();
