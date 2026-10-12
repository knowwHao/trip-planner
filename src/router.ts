import { createRouter, createWebHashHistory } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
  }
}

export const router = createRouter({
  // hash 模式讓 GitHub Pages 這種純靜態主機重新整理深層網址時不會 404
  history: createWebHashHistory(),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: '/', component: () => import('@/views/HomeView.vue'), meta: { title: '我的旅程' } },
    {
      path: '/trips/:tripId',
      component: () => import('@/views/TripLayout.vue'),
      children: [
        { path: '', component: () => import('@/views/ItineraryView.vue'), meta: { title: '行程' } },
        { path: 'expenses', component: () => import('@/views/ExpensesView.vue'), meta: { title: '旅費' } },
        { path: 'settings', component: () => import('@/views/TripSettingsView.vue'), meta: { title: '設定' } },
      ],
    },
    { path: '/:pathMatch(.*)*', component: () => import('@/views/NotFoundView.vue'), meta: { title: '找不到頁面' } },
  ],
})
