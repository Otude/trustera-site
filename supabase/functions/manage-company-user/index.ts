type RequestBody = {
  targetUserId?: string
  action?: 'suspend' | 'reactivate' | 'remove'
}