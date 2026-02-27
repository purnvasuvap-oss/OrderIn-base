# TODO: Update MenuPage.jsx to Delete Images/Videos from Firebase Storage on Delete/Update

## Steps to Complete:
- [x] Import deleteObject from 'firebase/storage' in MenuPage.jsx
- [x] Update handleDelete function to delete associated images and videos from Storage before deleting from Firestore
- [x] Update handleSave function to delete old images/videos from Storage when new files are uploaded during updates
- [x] Test delete functionality to ensure images/videos are removed from Storage
- [x] Test update functionality to ensure old files are deleted and new ones uploaded
- [x] Verify no orphaned files remain in Storage
