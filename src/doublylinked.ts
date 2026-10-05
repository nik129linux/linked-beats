/**
 * Generic doubly linked list with manual pointer management.
 * Storage uses only nodes with prev/next; no arrays are used internally
 * except in toArray() for rendering/tests.
 */

export class ListNode<T> {
  public prev: ListNode<T> | null = null;
  public next: ListNode<T> | null = null;

  constructor(public value: T) {}
}

export class DoublyLinkedList<T> {
  public head: ListNode<T> | null = null;
  public tail: ListNode<T> | null = null;
  public size = 0;

  /** Insert at the front */
  addFirst(value: T): ListNode<T> {
    const node = new ListNode(value);
    if (this.head === null) {
      this.head = node;
      this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }
    this.size += 1;
    return node;
  }

  /** Insert at the end */
  addLast(value: T): ListNode<T> {
    const node = new ListNode(value);
    if (this.tail === null) {
      this.head = node;
      this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }
    this.size += 1;
    return node;
  }

  /**
   * Return node at index (0-based) or null if out of range.
   * Walks from the nearer end for O(min(i, n-i)).
   */
  nodeAt(index: number): ListNode<T> | null {
    if (index < 0 || index >= this.size) return null;
    let current: ListNode<T> | null;
    // Walk from the nearer side
    if (index < this.size / 2) {
      current = this.head;
      for (let i = 0; i < index; i++) {
        if (current) current = current.next;
      }
    } else {
      current = this.tail;
      for (let i = this.size - 1; i > index; i--) {
        if (current) current = current.prev;
      }
    }
    return current;
  }

  /**
   * Insert value at index (0 <= index <= size).
   * Throws RangeError if index out of bounds.
   */
  insertAt(index: number, value: T): ListNode<T> {
    if (index < 0 || index > this.size) {
      throw new RangeError(`insertAt: index ${index} out of bounds (size ${this.size})`);
    }
    if (index === 0) return this.addFirst(value);
    if (index === this.size) return this.addLast(value);

    const nextNode = this.nodeAt(index);
    // nextNode is guaranteed non-null here
    if (nextNode === null) throw new RangeError(`insertAt: node at ${index} is null`);
    const prevNode = nextNode.prev;
    const newNode = new ListNode(value);
    newNode.prev = prevNode;
    newNode.next = nextNode;
    nextNode.prev = newNode;
    if (prevNode) {
      prevNode.next = newNode;
    } else {
      // Should not happen because index !== 0, but keep safe
      this.head = newNode;
    }
    this.size += 1;
    return newNode;
  }

  /**
   * Remove a specific node by pointer.
   * Returns the removed value or undefined if node is not in list
   * (we assume node belongs to this list).
   */
  removeNode(node: ListNode<T>): T {
    const prevNode = node.prev;
    const nextNode = node.next;

    if (prevNode) {
      prevNode.next = nextNode;
    } else {
      // node was head
      this.head = nextNode;
    }

    if (nextNode) {
      nextNode.prev = prevNode;
    } else {
      // node was tail
      this.tail = prevNode;
    }

    node.prev = null;
    node.next = null;
    this.size -= 1;
    return node.value;
  }

  /**
   * Remove at index and return value.
   * Throws RangeError if out of bounds.
   */
  removeAt(index: number): T {
    const node = this.nodeAt(index);
    if (node === null) {
      throw new RangeError(`removeAt: index ${index} out of bounds (size ${this.size})`);
    }
    return this.removeNode(node);
  }

  /**
   * Move element from fromIndex to toIndex.
   * Semantics: remove element at fromIndex, then insert it at toIndex
   * where toIndex is the insertion index in the list after removal
   * (clamped to [0, size]). This mirrors Array.splice(to,0, Array.splice(from,1)[0]).
   * toIndex may equal size to append.
   * Throws RangeError if indices out of bounds.
   */
  move(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.size) {
      throw new RangeError(`move: fromIndex ${fromIndex} out of bounds (size ${this.size})`);
    }
    if (toIndex < 0 || toIndex > this.size) {
      throw new RangeError(`move: toIndex ${toIndex} out of bounds (size ${this.size})`);
    }
    // No-op if moving last element to end (size position before decrement)
    // Example: size=4, move(3,4) means last to end -> no change, but from!=to
    // After detach size becomes 3, toIndex 4 > size so clamp

    const node = this.nodeAt(fromIndex);
    if (node === null) throw new RangeError(`move: node at ${fromIndex} is null`);

    const value = node.value;

    // Detach node
    const prevNode = node.prev;
    const nextNode = node.next;
    if (prevNode) prevNode.next = nextNode;
    else this.head = nextNode;
    if (nextNode) nextNode.prev = prevNode;
    else this.tail = prevNode;
    node.prev = null;
    node.next = null;
    this.size -= 1;

    // Adjust toIndex: if toIndex > size after removal, clamp
    // Also if from < to and to was originally == size, insertion at size is append
    let insertIndex = toIndex;
    // When moving within bounds, splice semantics without extra adjustment
    // However our size decreased by 1, so max valid insert is size (append)
    if (insertIndex > this.size) insertIndex = this.size;

    // Special: if fromIndex < toIndex and insertIndex corresponds to position after removal,
    // the final index of the element will be insertIndex (or insertIndex when from<to)
    // This matches the splice behavior where to is insertion index after removal.

    // Re-insert
    if (insertIndex === 0) {
      // re-use node object to preserve identity
      if (this.head === null) {
        this.head = node;
        this.tail = node;
      } else {
        node.next = this.head;
        this.head.prev = node;
        this.head = node;
      }
      node.value = value;
      this.size += 1;
      return;
    }
    if (insertIndex === this.size) {
      if (this.tail === null) {
        this.head = node;
        this.tail = node;
      } else {
        node.prev = this.tail;
        this.tail.next = node;
        this.tail = node;
      }
      node.value = value;
      this.size += 1;
      return;
    }

    const nextTarget = this.nodeAt(insertIndex);
    if (nextTarget === null) throw new RangeError(`move: target at ${insertIndex} is null`);
    const prevTarget = nextTarget.prev;
    node.prev = prevTarget;
    node.next = nextTarget;
    nextTarget.prev = node;
    if (prevTarget) prevTarget.next = node;
    else this.head = node;
    node.value = value;
    this.size += 1;
  }

  /** Restore a value at index (used for undo after delete) */
  restore(index: number, value: T): ListNode<T> {
    return this.insertAt(index, value);
  }

  /** Return index of node by identity, or -1 if not found */
  indexOf(node: ListNode<T>): number {
    let current = this.head;
    let idx = 0;
    while (current !== null) {
      if (current === node) return idx;
      current = current.next;
      idx++;
    }
    return -1;
  }

  /** Return values in order (for rendering/tests only) */
  toArray(): T[] {
    const result: T[] = [];
    let current = this.head;
    while (current !== null) {
      result.push(current.value);
      current = current.next;
    }
    return result;
  }
}
