# Administración del catálogo

Los productos, categorías, precios y datos de la tienda ya no están dentro de `app.js`.

## Opción simple

Editá `catalogo.json`. Es más seguro que modificar la lógica, aunque requiere volver a publicar ese archivo.

## Actualizaciones sin republicar la web

1. Publicá el contenido de `catalogo.json` en un CMS o servicio que entregue JSON público con CORS habilitado.
2. En `index.html`, colocá esa dirección una sola vez:

   `<meta name="catalogo-url" content="https://tu-servicio.com/catalogo">`

Desde entonces, la tienda consulta esa fuente en cada carga. Los productos y precios se administran allí sin tocar ni volver a publicar la página.

Si la fuente falla temporalmente, la tienda usa la última copia válida guardada en el navegador del visitante.
