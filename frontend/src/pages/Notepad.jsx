import { useEffect, useRef } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { QuillBinding } from 'y-quill'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import QuillCursors from 'quill-cursors'
import QuillResize from 'quill-resize-module'
import 'quill-resize-module/dist/resize.css'
import '../styles/variables.css'
import '../styles/Notepad.css'

// Register once (suppress warning on HMR / strict mode double init)
Quill.register('modules/resize', QuillResize, true)
Quill.register('modules/cursors', QuillCursors, true)

//quill tools
const toolbarOptions = [
  ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
  ['blockquote', 'code-block'],
  ['link', 'image', 'video'],

  [{ 'header': 1 }, { 'header': 2 }],               // custom button values
  [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
  [{ 'script': 'sub'}, { 'script': 'super' }],      // superscript/subscript
  [{ 'indent': '-1'}, { 'indent': '+1' }],          // outdent/indent
  [{ 'direction': 'rtl' }],                         // text direction

  [{ 'size': ['small', false, 'large', 'huge'] }],  // custom dropdown
  [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

  [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
  [{ 'font': [] }],
  [{ 'align': [] }],

  ['clean']                                         // remove formatting button
];

export function Notepad() {
  const containerRef = useRef(null)
  const headerRef = useRef(null)
  const editorRef = useRef(null)
  const quillRef = useRef(null)

  // Effect 1: init Quill once (it has no destroy, so guard with ref)
  useEffect(() => {
    if (!editorRef.current || quillRef.current) return

    const editor = new Quill(editorRef.current, {
      modules: {
        toolbar: toolbarOptions,
        cursors: true,
        resize: {
          modules: ['DisplaySize', 'Toolbar', 'Resize', 'Keyboard'],

          keyboardSelect: true,

          selectedClass: 'selected',
          activeClass: 'active',

          embedTags: ['VIDEO', 'IFRAME'],

          tools: [
            'left', 'right',  // Use predefined buttons
            {
              text: 'Alt',  // Button text
              // Custom button attributes
              attrs: {
                title: 'Set image alt',
                class: 'btn-alt'
              },
              // Button display condition
              verify(activeEle) {
                return activeEle?.tagName === 'IMG'
              },
              // Button click handler
              handler(evt, button, activeEle) {
                let alt = activeEle.alt || ''
                alt = window.prompt('Alt for image', alt)
                if (alt != null) {
                  activeEle.setAttribute('alt', alt)
                }
              }
            }
          ],

          parchment: {
            // Image configuration
            image: {
              attribute: ['width'],  // Adjustable attributes
              limit: {
                minWidth: 100        // Minimum width limit
              }
            },
            // Video configuration
            video: {
              attribute: ['width', 'height'],  // Adjustable attributes
              limit: {
                minWidth: 200,       // Minimum width limit
                ratio: 0.5625        // Width/height ratio limit (16:9)
              }
            }
          },
        },
      },
      placeholder: 'Compose an epic...',
      theme: 'snow',
      bounds: containerRef.current,
    })

    quillRef.current = editor

    //make editor draggable (only via header)
    // source: https://codepen.io/marcusparsons/pen/NMyzgR
    function makeDraggable(element, dragHandle) {
      let currentPosX = 0,
        currentPosY = 0,
        previousPosX = 0,
        previousPosY = 0

      dragHandle.onmousedown = dragMouseDown

      function dragMouseDown(e) {
        e.preventDefault()
        previousPosX = e.clientX
        previousPosY = e.clientY
        document.onmouseup = closeDragElement
        document.onmousemove = elementDrag
      }

      function elementDrag(e) {
        e.preventDefault()
        currentPosX = previousPosX - e.clientX
        currentPosY = previousPosY - e.clientY
        previousPosX = e.clientX
        previousPosY = e.clientY
        element.style.top = (element.offsetTop - currentPosY) + 'px'
        element.style.left = (element.offsetLeft - currentPosX) + 'px'
      }

      function closeDragElement() {
        document.onmouseup = null
        document.onmousemove = null
      }
    }

    makeDraggable(containerRef.current, headerRef.current)
  }, [])

  // Effect 2: yjs + WebRTC sync (normal lifecycle — cleanup & re-init is safe)
  useEffect(() => {
    const editor = quillRef.current
    if (!editor) return

    const ydoc = new Y.Doc()
    const signalingUrl = import.meta.env.VITE_SIGNALING_URL
    const provider = new WebrtcProvider('quill-demo-room', ydoc, {
      signaling: [signalingUrl, 'ws://localhost:4444'],
      peerOpts: {
        iceServers: [
          { urls: 'stun:stun.relay.metered.ca:80' },
          { urls: 'turn:standard.relay.metered.ca:80', username: 'd7b701277bbeeaf2fa89b3d5', credential: 'cHkGLITrCu0bzSZq' },
          { urls: 'turn:standard.relay.metered.ca:80?transport=tcp', username: 'd7b701277bbeeaf2fa89b3d5', credential: 'cHkGLITrCu0bzSZq' },
          { urls: 'turn:standard.relay.metered.ca:443', username: 'd7b701277bbeeaf2fa89b3d5', credential: 'cHkGLITrCu0bzSZq' },
          { urls: 'turns:standard.relay.metered.ca:443?transport=tcp', username: 'd7b701277bbeeaf2fa89b3d5', credential: 'cHkGLITrCu0bzSZq' },
        ],
      },
    })

    const ytext = ydoc.getText('quill')
    const binding = new QuillBinding(ytext, editor, provider.awareness)

    const handleBlur = () => editor.blur()
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('blur', handleBlur)
      binding.destroy()
      provider.destroy()
      ydoc.destroy()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="notepad-container"
    >
      <div ref={headerRef} className="notepad-header">
        <h3>Notepad</h3>
      </div>
      <div ref={editorRef} className="notepad-editor" />
      <div className="notepad-resize-handle" />
    </div>
  )
}
