import { useEffect, useRef, useState } from 'react'
import Quill from 'quill'
import { QuillBinding } from 'y-quill'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import QuillCursors from 'quill-cursors'
import '../styles/Notepad.css'

// Register QuillCursors module
Quill.register('modules/cursors', QuillCursors)

export function Notepad() {
  const editorRef = useRef(null)
  const quillRef = useRef(null)
  const containerRef = useRef(null)
  
  const [position, setPosition] = useState({ x: window.innerWidth - 520, y: window.innerHeight - 500 })
  const [size, setSize] = useState({ width: 500, height: 400 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [startResize, setStartResize] = useState({ x: 0, y: 0, width: 0, height: 0 })
  
  const ydocRef = useRef(null)
  const providerRef = useRef(null)
  const bindingRef = useRef(null)

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


  useEffect(() => {
    // Load Quill CSS from CDN
    const link = document.createElement('link')
    link.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css'
    link.rel = 'stylesheet'
    document.head.appendChild(link)
    
    initializeQuill()
    
    // Auto-connect to collaboration
    connectCollaboration()
    
    return () => {
      // Cleanup on unmount
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
          }
        },
        theme: 'snow',
        placeholder: '   Start typing...'
      })
    }
  }

  const connectCollaboration = () => {
    try {
      // Determine the WebSocket URL based on environment
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws/collab'
      
      // Initialize Yjs document and provider
      const ydoc = new Y.Doc()
      ydocRef.current = ydoc
      
      const provider = new WebsocketProvider(
        wsUrl,
        'notus-notepad',
        ydoc,
        {
          connect: true
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
      
      console.log('Connected to collaboration server')
    } catch (err) {
      console.error('Failed to connect to collaboration server:', err)
    }
  }

  const handleHeaderMouseDown = (e) => {
    if (e.button !== 0) return // Only left click
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    })
  }

  const handleResizeMouseDown = (e) => {
    if (e.button !== 0) return // Only left click
    e.stopPropagation()
    setIsResizing(true)
    setStartResize({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    })
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        })
      }
      if (isResizing) {
        const deltaX = e.clientX - startResize.x
        const deltaY = e.clientY - startResize.y
        setSize({
          width: Math.max(300, startResize.width + deltaX),
          height: Math.max(200, startResize.height + deltaY),
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
    }

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, isResizing, dragOffset, startResize])

  return (
    <div
      ref={containerRef}
      className="notepad-container"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }}
    >
      <div className="notepad-header" onMouseDown={handleHeaderMouseDown}>
        <h3>Notepad</h3>
      </div>
      <div ref={editorRef} className="notepad-editor" />
      <div className="notepad-resize-handle" onMouseDown={handleResizeMouseDown} />
    </div>
  )
}
