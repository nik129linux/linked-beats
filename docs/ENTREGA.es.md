# Linked Beats — Entrega

Que es: reproductor en el navegador donde cada playlist es una lista doblemente enlazada hecha a mano. No hay canciones quemadas. Todo viene del sistema de archivos del usuario o de vistas previas de iTunes.

Requisitos del taller y donde verlos:

* Agregar al inicio: `src/doublylinked.ts:addFirst` y boton Add to start en `src/ui/controls.ts`. Demo: clic en Add to start, elegir archivo, aparece arriba.
* Agregar al final: `addLast` y boton Add to end. Demo: clic en Add to end, aparece abajo.
* Agregar en cualquier posicion sin escribir numero: `insertAt` y gaps arrastrables en `src/ui/gaps.ts` y `src/ui/dragdrop.ts`. Demo: arrastrar fila a un gap, el orden cambia.
* Eliminar: `removeNode` y `src/ui/actions.ts:handleDelete` con Undo. Demo: Remove y Undo en el toast.
* Avanzar: `src/player.ts:next` con `node.next`. Demo: boton Next o Shift + Flecha derecha.
* Retroceder: `src/player.ts:prev` con `node.prev`. Demo: boton Previous o Shift + Flecha izquierda.
* Funciones pertinentes extra: shuffle, repeat, busqueda, visualizador, atajos J/L, -10s/+10s, velocidad, volumen, Media Session en `src/ui/controls.ts`.
* Cargar desde el sistema de archivos: `src/ui/actions.ts:createSongFromFile` con inputs `audio/*` y `webkitdirectory`. Demo: Add audio files abre el selector del sistema.
* Playlists cada una es una lista: `src/library.ts` usa `Map<string, DoublyLinkedList>`. Demo: crear y cambiar playlists en el panel.
* Frontend: `index.html` y `styles/*.css` con diseno editorial.
* TypeScript: `src/**/*.ts` en modo estricto, compila con `npm run build`.

Como ejecutar:

```bash
npm install && npm run build && npm run serve
# abrir http://localhost:8000
```

Version en vivo: https://linked-beats-sooty.vercel.app

Preguntas posibles:

1. Por que prev y next son O(1)? Porque solo hacen `current = current.prev` o `current.next`. No recorren la lista.
2. Por que insertAt camina desde el extremo mas cercano? Para reducir pasos a `min(i, n-i)`. Es O(n) en el peor caso pero recorre menos.
3. Que pasa con head y tail al borrar el unico nodo? Ambos quedan en null y size en 0. El metodo `removeNode` lo garantiza.
4. Por que doblemente enlazada y no simple para previous? Con simple no hay puntero al anterior y volver atras seria O(n). Con doble es O(1).
5. Como funciona reverse? Recorre cada nodo e intercambia `prev` y `next`, al final intercambia `head` y `tail`. Es O(n).
