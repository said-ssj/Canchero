package pe.canchero.backend.service;

import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.it.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static pe.canchero.backend.it.PostgresTestSupport.*;

class ChatPostgresTest {
    JdbcTemplate jdbc;
    ChatService chat;
    AnnotationConfigApplicationContext context;
    @Configuration @EnableTransactionManagement static class Transactions {}
    @BeforeEach void setup() throws Exception {
        PostgresTestServer.requireAvailable(); PostgresTestServer.resetSchema(); jdbc=PostgresTestSupport.jdbc(); seedTwoVenues(jdbc);
        jdbc.execute("""
            DO $$ BEGIN
              IF NOT EXISTS(select 1 from pg_roles where rolname='anon') THEN CREATE ROLE anon; END IF;
              IF NOT EXISTS(select 1 from pg_roles where rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
            END $$;
            ALTER TABLE public.usuario ADD COLUMN apellido text;
            CREATE TABLE public.perfil_jugador(id_usuario uuid primary key, foto text);
            DROP SCHEMA IF EXISTS realtime CASCADE; CREATE SCHEMA realtime;
            DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA auth;
            CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
            CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$select (auth.jwt()->>'sub')::uuid$$;
            CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$select current_setting('realtime.topic',true)$$;
            CREATE TABLE realtime.messages(extension text default 'broadcast',topic text,payload jsonb,private boolean);
            ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
            GRANT USAGE ON SCHEMA realtime,auth TO authenticated;
            GRANT SELECT ON realtime.messages TO authenticated;
            CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean DEFAULT true) RETURNS void
              LANGUAGE sql AS $$insert into realtime.messages(topic,payload,private) values($3,$1,$4)$$;
            """);
        Path root=Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while(root!=null&&!Files.isDirectory(root.resolve("supabase/migrations"))) root=root.getParent();
        assertNotNull(root);
        jdbc.execute(Files.readString(root.resolve("supabase/migrations/20261112000005_mensajeria_privada.sql")));
        context=new AnnotationConfigApplicationContext();context.register(Transactions.class);
        context.registerBean(JdbcTemplate.class,()->jdbc);
        context.registerBean(DataSourceTransactionManager.class,()->new DataSourceTransactionManager(jdbc.getDataSource()));
        context.registerBean(ChatService.class);context.refresh();chat=context.getBean(ChatService.class);
    }
    @AfterEach void close(){if(context!=null)context.close();}
    UUID conversation(){return UUID.fromString(chat.open(PLAYER_1,PLAYER_2_ID).id());}
    @Test void concurrentOpeningCreatesOnePairAndExactlyTwoMembers() throws Exception {
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->chat.open(PLAYER_1,PLAYER_2_ID));
            var b=pool.submit(()->chat.open(PLAYER_2,PLAYER_1_ID));
            assertEquals(a.get(10,TimeUnit.SECONDS).id(),b.get(10,TimeUnit.SECONDS).id());
        }
        assertEquals(1,jdbc.queryForObject("select count(*) from chat_conversacion",Integer.class));
        assertEquals(2,jdbc.queryForObject("select count(*) from chat_miembro",Integer.class));
        assertThrows(ResponseStatusException.class,()->chat.open(PLAYER_1,PLAYER_1_ID));
    }
    @Test void unreadAndReadArePrivateAndMonotonic() {
        UUID id=conversation();
        var m=chat.send(PLAYER_1,id,"Hola <script>no HTML</script>",UUID.randomUUID());
        assertEquals(1,chat.list(PLAYER_2).getFirst().unread());
        assertEquals(0,chat.list(PLAYER_1).getFirst().unread());
        assertEquals(0,chat.list(OWNER_A).size());
        assertThrows(ResponseStatusException.class,()->chat.messages(OWNER_A,id,null,null));
        assertThrows(ResponseStatusException.class,()->chat.send(OWNER_A,id,"intruso",UUID.randomUUID()));
        assertThrows(ResponseStatusException.class,()->chat.read(OWNER_A,id,Long.parseLong(m.id())));
        chat.read(PLAYER_2,id,Long.parseLong(m.id()));
        assertEquals(0,chat.list(PLAYER_2).getFirst().unread());
        assertTrue(m.createdAt().endsWith("Z"));
    }
    @Test void concurrentRetriesStoreAndBroadcastOnlyOnce() throws Exception {
        UUID id=conversation(),request=UUID.randomUUID();
        try(var pool=Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->chat.send(PLAYER_1,id,"Un mensaje",request));
            var b=pool.submit(()->chat.send(PLAYER_1,id,"Un mensaje",request));
            assertEquals(a.get(10,TimeUnit.SECONDS).id(),b.get(10,TimeUnit.SECONDS).id());
        }
        assertEquals(1,jdbc.queryForObject("select count(*) from chat_mensaje",Integer.class));
        assertEquals(2,jdbc.queryForObject("select count(*) from realtime.messages",Integer.class));
        assertFalse(jdbc.queryForObject("select bool_or(payload::text like '%Un mensaje%') from realtime.messages",Boolean.class));
        assertThrows(ResponseStatusException.class,()->chat.send(PLAYER_1,id,"Otro texto",request));
    }
    @Test void blockingIsPersistentBilateralAndPreservesHistory() {
        UUID id=conversation();chat.send(PLAYER_1,id,"Anterior",UUID.randomUUID());
        chat.block(PLAYER_2,PLAYER_1_ID,true);
        assertThrows(ResponseStatusException.class,()->chat.send(PLAYER_1,id,"Nuevo",UUID.randomUUID()));
        assertThrows(ResponseStatusException.class,()->chat.send(PLAYER_2,id,"Nuevo",UUID.randomUUID()));
        assertThrows(ResponseStatusException.class,()->chat.open(PLAYER_1,PLAYER_2_ID));
        assertEquals(1,chat.messages(PLAYER_2,id,null,null).items().size());
        assertTrue(chat.list(PLAYER_2).getFirst().blockedByMe());
        chat.block(PLAYER_1,PLAYER_2_ID,false); // No elimina el bloqueo del otro participante.
        assertFalse(chat.list(PLAYER_1).getFirst().canSend());
        chat.block(PLAYER_2,PLAYER_1_ID,false);
        assertTrue(chat.list(PLAYER_1).getFirst().canSend());
    }
    @Test void historyPaginationAndCatchupNeverSkipMessages() {
        UUID id=conversation();
        for(int i=0;i<85;i++) jdbc.update("insert into chat_mensaje(id_conversacion,id_autor,id_solicitud,contenido) values (?,?,?,?)",id,PLAYER_1_ID,UUID.randomUUID(),"Mensaje "+i);
        var latest=chat.messages(PLAYER_2,id,null,null);assertEquals(40,latest.items().size());assertTrue(latest.hasMore());
        var older=chat.messages(PLAYER_2,id,Long.parseLong(latest.items().getFirst().id()),null);
        assertEquals(40,older.items().size());assertTrue(older.hasMore());
        var first=chat.messages(PLAYER_2,id,Long.parseLong(older.items().getFirst().id()),null);assertEquals(5,first.items().size());assertFalse(first.hasMore());
        var catchup=chat.messages(PLAYER_2,id,null,Long.parseLong(first.items().getLast().id()));
        assertEquals(older.items(),catchup.items());assertTrue(catchup.hasMore());
    }
    @Test void limitsAndReportsAreStoredWithoutInventingModeration() {
        UUID id=conversation();
        assertThrows(ResponseStatusException.class,()->chat.send(PLAYER_1,id," ",UUID.randomUUID()));
        assertThrows(ResponseStatusException.class,()->chat.send(PLAYER_1,id,"x".repeat(4001),UUID.randomUUID()));
        for(int i=0;i<30;i++) chat.send(PLAYER_1,id,"Hola "+i,UUID.randomUUID());
        assertEquals(429,assertThrows(ResponseStatusException.class,()->chat.send(PLAYER_1,id,"Límite",UUID.randomUUID())).getStatusCode().value());
        chat.report(PLAYER_2,id,"Contenido inapropiado");
        assertEquals("pendiente",jdbc.queryForObject("select estado from chat_reporte",String.class));
        assertThrows(ResponseStatusException.class,()->chat.report(OWNER_B,id,"No soy participante"));
    }
    @Test void browserCannotReadTablesAndPrivateBroadcastIsOnlyForItsRecipient() throws Exception {
        UUID id=conversation();chat.send(PLAYER_1,id,"Privado",UUID.randomUUID());
        for(String table:List.of("chat_conversacion","chat_miembro","chat_mensaje","chat_bloqueo","chat_reporte"))
            assertFalse(jdbc.queryForObject("select has_table_privilege('authenticated',?,'SELECT,INSERT,UPDATE,DELETE')",Boolean.class,"public."+table));
        try(var c=jdbc.getDataSource().getConnection();var s=c.createStatement()) {
            c.setAutoCommit(false);
            s.execute("set local role authenticated");
            s.execute("select set_config('request.jwt.claims','{\"sub\":\""+PLAYER_1_ID+"\",\"canchero_user_id\":\""+PLAYER_1_ID+"\"}',true)");
            s.execute("select set_config('realtime.topic','chat-user:"+PLAYER_1_ID+"',true)");
            try(var r=s.executeQuery("select count(*) from realtime.messages")){r.next();assertEquals(1,r.getInt(1));}
            s.execute("select set_config('realtime.topic','chat-user:"+PLAYER_2_ID+"',true)");
            try(var r=s.executeQuery("select count(*) from realtime.messages")){r.next();assertEquals(0,r.getInt(1));}
            c.rollback();
        }
    }
}
