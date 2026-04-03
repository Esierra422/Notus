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

// Register Quill modules
Quill.register('modules/resize', QuillResize)
Quill.register('modules/cursors', QuillCursors)

const toolbarOptions = [
  ['bold', 'italic', 'underline', 'strike'],
  ['blockquote', 'code-block'],
  ['link', 'image', 'video'],

  [{ 'header': 1 }, { 'header': 2 }],
  [{ 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }],
  [{ 'script': 'sub'}, { 'script': 'super' }],
  [{ 'indent': '-1'}, { 'indent': '+1' }],
  [{ 'direction': 'rtl' }],

  [{ 'size': ['small', false, 'large', 'huge'] }],
  [{ 'header': [1, 2, 3, 4, 5, 6, false] }],

  [{ 'color': [] }, { 'background': [] }],
  [{ 'font': [] }],
  [{ 'align': [] }],

  ['clean']
]

// Make an element draggable via a drag handle
function makeDraggable(element, dragHandle) {
  let currentPosX = 0, currentPosY = 0, previousPosX = 0, previousPosY = 0

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

export function Notepad() {
  const editorRef = useRef(null)
  const quillRef = useRef(null)
  const containerRef = useRef(null)
  const headerRef = useRef(null)

  const ydocRef = useRef(null)
  const providerRef = useRef(null)
  const bindingRef = useRef(null)


  useEffect(() => {
    initializeQuill()
    connectCollaboration()

    // Make the notepad draggable via the header
    if (containerRef.current && headerRef.current) {
      makeDraggable(containerRef.current, headerRef.current)
    }
    
    return () => {
      if (providerRef.current) {
        providerRef.current.disconnect()
        providerRef.current = null
      }
      if (ydocRef.current) {
        ydocRef.current.destroy()
        ydocRef.current = null
      }
    }
  }, [])

  const initializeQuill = () => {
    if (editorRef.current && !quillRef.current) {
      quillRef.current = new Quill(editorRef.current, {
        modules: {
          cursors: true,
          toolbar: toolbarOptions,
          history: {
            userOnly: true
          },
          resize: {
            modules: ['DisplaySize', 'Toolbar', 'Resize', 'Keyboard'],
            keyboardSelect: true,
            selectedClass: 'selected',
            activeClass: 'active',
            embedTags: ['VIDEO', 'IFRAME'],
            tools: [
              'left', 'right',
              {
                text: 'Alt',
                attrs: { title: 'Set image alt', class: 'btn-alt' },
                verify(activeEle) { return activeEle?.tagName === 'IMG' },
                handler(evt, button, activeEle) {
                  let alt = activeEle.alt || ''
                  alt = window.prompt('Alt for image', alt)
                  if (alt != null) { activeEle.setAttribute('alt', alt) }
                }
              }
            ],
            parchment: {
              image: {
                attribute: ['width'],
                limit: { minWidth: 100 }
              },
              video: {
                attribute: ['width', 'height'],
                limit: { minWidth: 200, ratio: 0.5625 }
              }
            },
          },
        },
        theme: 'snow',
        placeholder: 'Start typing…',
        bounds: containerRef.current,
      })
    }
  }

  const connectCollaboration = () => {
    try {
      // Signaling server URL: set VITE_SIGNALING_URL in production (.env.production)
      const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:4444'
      
      // Initialize Yjs document
      const ydoc = new Y.Doc()
      ydocRef.current = ydoc
      
      const provider = new WebrtcProvider(
        'notus-notepad',
        ydoc,
        {
          signaling: [signalingUrl],
          peerOpts: {
            iceServers: [
              { urls: 'stun:stun.relay.metered.ca:80' },
              { urls: 'turn:standard.relay.metered.ca:80', username: 'd7b701277bbeeaf2fa89b3d5', credential: 'cHkGLITrCu0bzSZq' },
              { urls: 'turn:standard.relay.metered.ca:80?transport=tcp', username: 'd7b701277bbeeaf2fa89b3d5', credential: 'cHkGLITrCu0bzSZq' },
              { urls: 'turn:standard.relay.metered.ca:443', username: 'd7b701277bbeeaf2fa89b3d5', credential: 'cHkGLITrCu0bzSZq' },
              { urls: 'turns:standard.relay.metered.ca:443?transport=tcp', username: 'd7b701277bbeeaf2fa89b3d5', credential: 'cHkGLITrCu0bzSZq' },
            ],
          },
        }
      )
      providerRef.current = provider
      
      // Get or create shared text type
      const type = ydoc.getText('shared-notepad')
      
      // Create binding between Quill and Yjs
      const binding = new QuillBinding(
        type,
        quillRef.current,
        provider.awareness
      )
      bindingRef.current = binding
      
      console.log('Connected to collaboration signaling server:', signalingUrl)
    } catch (err) {
      console.error('Failed to connect to collaboration server:', err)
    }
  }

  return (
    <div
      ref={containerRef}
      className="notepad-container"
    >
      <div ref={headerRef} className="notepad-header">
        <h3>Notepad</h3>
      </div>
      <div ref={editorRef} className="notepad-editor ql-snow" />
      <div className="notepad-resize-handle" />
    </div>
  )
}
