/**
 * User to-dos — stored at users/{uid}/todos/{todoId}
 * Optional dueDate (Timestamp) for calendar integration.
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

export async function getTodos(userId) {
  const ref = collection(db, 'users', userId, 'todos')
  const q = query(ref, orderBy('createdAt', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Get todos with dueDate in a given month (for calendar view).
 */
export async function getTodosInRange(userId, year, month) {
  const start = Timestamp.fromDate(new Date(year, month, 1, 0, 0, 0))
  const end = Timestamp.fromDate(new Date(year, month + 1, 0, 23, 59, 59, 999))
  const ref = collection(db, 'users', userId, 'todos')
  const q = query(
    ref,
    where('dueDate', '>=', start),
    where('dueDate', '<=', end),
    orderBy('dueDate', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function addTodo(userId, text, dueDate = null) {
  const ref = collection(db, 'users', userId, 'todos')
  const data = {
    text: (text || '').trim(),
    done: false,
    createdAt: serverTimestamp(),
  }
  if (dueDate) {
    data.dueDate = dueDate instanceof Timestamp ? dueDate : Timestamp.fromDate(new Date(dueDate))
  }
  const docRef = await addDoc(ref, data)
  return {
    id: docRef.id,
    text: (text || '').trim(),
    done: false,
    createdAt: new Date(),
    ...(dueDate && { dueDate: data.dueDate }),
  }
}

export async function setTodoDueDate(userId, todoId, dueDate) {
  const ref = doc(db, 'users', userId, 'todos', todoId)
  const ts = dueDate ? (dueDate instanceof Timestamp ? dueDate : Timestamp.fromDate(new Date(dueDate))) : null
  await updateDoc(ref, { dueDate: ts })
}

export async function toggleTodo(userId, todoId, done) {
  const ref = doc(db, 'users', userId, 'todos', todoId)
  await updateDoc(ref, { done })
}

export async function deleteTodo(userId, todoId) {
  const ref = doc(db, 'users', userId, 'todos', todoId)
  await deleteDoc(ref)
}
