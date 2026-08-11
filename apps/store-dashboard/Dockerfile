FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/store-dashboard ./apps/store-dashboard
RUN npm install
WORKDIR /app/apps/store-dashboard
# Pass at build time, e.g. --build-arg VITE_API_BASE_URL=https://api.example.com
# Do not default to localhost for production images.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/store-dashboard/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/store-dashboard/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
