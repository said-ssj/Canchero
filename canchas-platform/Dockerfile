# 1. Etapa de compilación con Maven y JDK 17
FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /app

# Copiamos todo el contenido del directorio de la API
COPY . .

# Compilamos el proyecto omitiendo las pruebas para agilizar
RUN ./mvnw clean package -DskipTests

# 2. Etapa de ejecución ligera con JRE 17
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Copiamos el JAR generado desde la etapa anterior
COPY --from=build /app/target/*.jar app.jar

# Puerto en el que escucha Spring Boot (por defecto 8080)
EXPOSE 8080

# Comando para arrancar la aplicación
ENTRYPOINT ["java", "-jar", "app.jar"]