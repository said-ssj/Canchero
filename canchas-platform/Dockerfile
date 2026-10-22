# 1. Etapa de compilación utilizando Maven y JDK 17
FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /app

# Instalamos Maven directamente en el contenedor Alpine
RUN apk add --no-cache maven

# Copiamos todo el repositorio completo
COPY . .

# Compilamos específicamente el proyecto ubicado dentro del monorepo
RUN mvn -f canchas-platform/apps/api/pom.xml clean package -DskipTests

# 2. Etapa de ejecución ligera con JRE 17
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Copiamos el archivo JAR generado apuntando a su ruta exacta dentro del monorepo
COPY --from=build /app/canchas-platform/apps/api/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]