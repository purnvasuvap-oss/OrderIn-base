# Firebase Hosting Deployment Guide

## Current Setup

Your project is now initialized for Firebase Hosting deployment.

### Configuration Files Created

1. **firebase.json** - Firebase hosting configuration
   - Public directory: `dist` (Vite build output)
   - Configured for single-page application (SPA) with automatic routing

2. **.firebaserc** - Firebase project configuration
   - Default project: `orderin-7f8bc` (Orderin)

### Hosting Sites Available

Your project has the following hosting sites configured:

| Site ID | URL | App ID |
|---------|-----|--------|
| orderin-7f8bc | https://orderin-7f8bc.web.app | -- |
| orderin-admin | https://orderin-admin.web.app | 1:977042319750:web:fbdd7df96eba136669a407 |
| orderin-client | https://orderin-client.web.app | 1:977042319750:web:eddc81a64139d75769a407 |
| orderin-customers | https://orderin-customers.web.app | 1:977042319750:web:4a44dec8cd6aa49e69a407 |

## Deployment Steps

### Step 1: Build Your Application
```bash
npm run build
```
This creates a production build in the `dist` directory.

### Step 2: Deploy to Firebase
```bash
firebase deploy
```
This will deploy the contents of `dist` to your Firebase hosting site.

### Step 3: View Your Live Site
After deployment, your site will be available at:
- **Main URL**: https://orderin-7f8bc.web.app
- **Admin Site**: https://orderin-admin.web.app

## Additional Tips

### Deploy to Specific Hosting Site
To deploy to a specific hosting site (e.g., orderin-admin):
```bash
firebase deploy --only hosting:orderin-admin
```

### Check Deployment Status
```bash
firebase hosting:channel:list
```

### Preview Deployment Before Going Live
```bash
firebase hosting:channel:deploy preview-channel-name
```

### View Deployment History
```bash
firebase hosting:releases:list
```

## Next Steps

1. Run `npm run build` to create the production build
2. Run `firebase deploy` to push your app live
3. Visit your site at https://orderin-7f8bc.web.app

Your Firebase Hosting is now ready! 🚀
