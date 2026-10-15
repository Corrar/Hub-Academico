"""Synthetic demonstration data for an EMPTY development or staging database.

Every name is fictional and every address carries ``.demo``. The command never
runs against a base that already has courses, and it never creates the
coordination account: run ``bootstrap`` first.
"""

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select

from .academic.clock import ZONE, local_today
from .main import audit
from .models import (
    Attachment,
    AttendanceLesson,
    AttendanceRecord,
    ClassGroup,
    Course,
    Enrollment,
    Membership,
    Publication,
    Schedule,
    Subject,
    Submission,
    User,
    now,
)
from .security import passwords, utc

COURSES = [
    ("CD", "Ciência de Dados"),
    ("GC", "Gestão Comercial"),
]
# code, name, course, teacher key (None = vacancy shown on the dashboard)
SUBJECTS = [
    ("APM", "Aprendizado de Máquina", "CD", "marcelo"),
    ("BD", "Banco de Dados", "CD", "marcelo"),
    ("EST", "Estatística Aplicada", "CD", None),
    ("MKD", "Marketing Digital", "GC", "renata"),
    ("GFI", "Gestão Financeira", "GC", "renata"),
]
TEACHERS = {"marcelo": "Marcelo Dias", "renata": "Renata Alves"}
STUDENTS = {
    "ana": ("Ana Ribeiro", "CD"),
    "beatriz": ("Beatriz Fontes", "CD"),
    "caio": ("Caio Moraes", "CD"),
    "diego": ("Diego Ramos", "CD"),
    "lucas": ("Lucas Silveira", "GC"),
    "julia": ("Julia Vasques", "GC"),
    "mariana": ("Mariana Farias", "GC"),
}


def email(name):
    first, last = name.lower().split()[:2]
    return f"{first}.{last}.demo@fatec.sp.gov.br"


def at(day, hour, minute=0):
    return datetime.combine(day, time(hour, minute), ZONE).astimezone(timezone.utc)


class Seeder:
    def __init__(self, db, actor, password):
        self.db, self.actor, self.today = db, actor, local_today()
        self.hash = passwords.hash(password)

    def add(self, row):
        self.db.add(row)
        audit(self.db, self.actor, "demo_seed", row)
        return row

    def run(self):
        today = self.today
        semester = f"{today.year}/{1 if today.month <= 6 else 2}"
        starts = min(
            date(today.year, 2, 1) if today.month <= 6 else date(today.year, 8, 1),
            today - timedelta(weeks=8),
        )
        ends = max(
            date(today.year, 6, 30) if today.month <= 6 else date(today.year, 12, 20),
            today + timedelta(weeks=8),
        )
        courses = {code: self.add(Course(code=code, name=name)) for code, name in COURSES}
        self.db.flush()
        people = {
            key: self.add(
                User(name=name, email=email(name), role="teacher", password_hash=self.hash)
            )
            for key, name in TEACHERS.items()
        }
        for key, (name, _) in STUDENTS.items():
            people[key] = self.add(
                User(name=name, email=email(name), role="student", password_hash=self.hash)
            )
        groups = {}
        for code, name, course, teacher in SUBJECTS:
            subject = self.add(Subject(course_id=courses[course].id, code=code, name=name, term=3))
            self.db.flush()
            groups[code] = self.add(
                ClassGroup(subject_id=subject.id, semester=semester, name="Noturno A")
            )
        self.db.flush()
        for code, _, course, teacher in SUBJECTS:
            members = [key for key, (_, home) in STUDENTS.items() if home == course]
            if teacher:
                members.append(teacher)
            for key in members:
                self.add(
                    Membership(
                        user_id=people[key].id,
                        group_id=groups[code].id,
                        starts_on=starts,
                        ends_on=ends,
                    )
                )
        # Two lessons tonight so the home page and the roll call have content.
        slots = {
            "APM": (0, 19 * 60, 20 * 60 + 40, "Lab 03"),
            "MKD": (0, 20 * 60 + 50, 22 * 60 + 30, "Sala 08"),
            "BD": (1, 19 * 60, 20 * 60 + 40, "Lab 04"),
            "GFI": (1, 20 * 60 + 50, 22 * 60 + 30, "Sala 08"),
            "EST": (2, 19 * 60, 20 * 60 + 40, "Sala 12"),
        }
        schedules = {}
        for code, (shift, begin, end, room) in slots.items():
            schedules[code] = self.add(
                Schedule(
                    group_id=groups[code].id,
                    weekday=(today.weekday() + shift) % 7,
                    starts_minute=begin,
                    ends_minute=end,
                    starts_on=starts,
                    ends_on=ends,
                    room=room,
                )
            )
        self.db.flush()
        self.attendance(schedules["APM"], "marcelo", people, {"diego": [1]})
        self.attendance(schedules["MKD"], "renata", people, {"lucas": [1, 2, 4]})
        self.publications(groups, people)
        # Seeded content is history: only later publications trigger push.
        self.db.flush()
        for row in self.db.scalars(select(Publication)):
            if not row.publish_at or utc(row.publish_at) <= now():
                row.fanout_at = row.created_at or now()
        self.db.commit()
        return {key: row.email for key, row in people.items()}

    def attendance(self, schedule, teacher, people, absences):
        topics = ["Revisão", "Exercícios guiados", "Estudo de caso", "Laboratório", "Seminário"]
        for week in range(1, 6):
            day = self.today - timedelta(weeks=week)
            if day < schedule.starts_on:
                break
            lesson = self.add(
                AttendanceLesson(
                    group_id=schedule.group_id,
                    schedule_id=schedule.id,
                    lesson_date=day,
                    topic=topics[week - 1],
                    recorded_by=people[teacher].id,
                    recorded_at=at(day, 22, 35),
                )
            )
            self.db.flush()
            students = self.db.scalars(
                select(Membership.user_id)
                .join(User)
                .where(Membership.group_id == schedule.group_id, User.role == "student")
            )
            for student in students:
                missed = any(
                    people[key].id == student and week in weeks for key, weeks in absences.items()
                )
                self.db.add(
                    AttendanceRecord(lesson_id=lesson.id, student_id=student, present=not missed)
                )

    def publication(self, author, **values):
        row = self.add(Publication(creator_id=author.id, draft=False, **values))
        self.db.flush()
        return row

    def submission(self, activity, student, body, sent=None, grade=None, feedback=""):
        row = self.add(
            Submission(
                publication_id=activity.id,
                student_id=student.id,
                body=body,
                draft=sent is None,
                submitted_at=sent,
                grade=grade,
                feedback=feedback,
                graded_at=now() if grade is not None else None,
            )
        )
        self.db.flush()
        return row

    def publications(self, groups, people):
        today, marcelo, renata = self.today, people["marcelo"], people["renata"]
        group = {code: row.id for code, row in groups.items()}
        lista = self.publication(
            marcelo,
            kind="activity",
            title="Lista 2 — Regressão linear",
            body="Resolva os exercícios 1 a 6 e explique a escolha das variáveis.",
            audience="group",
            group_id=group["APM"],
            due_at=at(today + timedelta(days=2), 23, 59),
        )
        self.publication(
            marcelo,
            kind="activity",
            title="Modelagem do estudo de caso",
            body="Entregue o diagrama entidade-relacionamento e o dicionário de dados.",
            audience="group",
            group_id=group["BD"],
            due_at=at(today + timedelta(days=6), 23, 59),
        )
        plano = self.publication(
            renata,
            kind="activity",
            title="Plano de Marketing Digital",
            body="Elabore um plano para um negócio local com público, canais, cronograma e KPIs.",
            audience="group",
            group_id=group["MKD"],
            due_at=at(today + timedelta(days=1), 23, 59),
        )
        caixa = self.publication(
            renata,
            kind="activity",
            title="Fluxo de caixa projetado",
            body="Monte o fluxo de caixa dos próximos seis meses da empresa do estudo de caso.",
            audience="group",
            group_id=group["GFI"],
            due_at=at(today - timedelta(days=3), 23, 59),
        )
        slides = self.publication(
            marcelo,
            kind="material",
            title="Slides — Regressão linear",
            body="Material de apoio da aula, com os exemplos resolvidos.",
            audience="group",
            group_id=group["APM"],
        )
        text = "Roteiro da aula\n\n1. Regressão simples\n2. Mínimos quadrados\n3. Resíduos\n"
        self.add(
            Attachment(
                publication_id=slides.id,
                owner_id=marcelo.id,
                name="roteiro-regressao.txt",
                content=text.encode(),
                media_type="text/plain",
                size=len(text.encode()),
            )
        )
        self.publication(
            renata,
            kind="material",
            title="Modelo de plano de marketing",
            body="Estrutura sugerida para o trabalho, seção por seção.",
            audience="group",
            group_id=group["MKD"],
        )
        coordination = self.actor
        self.publication(
            coordination,
            kind="notice",
            title="Rematrícula do próximo semestre",
            body="A rematrícula acontece pelo portal do aluno. Pendências de documentação "
            "devem ser resolvidas na secretaria.",
            audience="institution",
        )
        self.publication(
            marcelo,
            kind="notice",
            title="Aula de quinta no laboratório",
            body="Tragam o notebook com o ambiente configurado.",
            audience="group",
            group_id=group["BD"],
        )
        semana = self.publication(
            coordination,
            kind="event",
            title="Semana de Tecnologia",
            body="Palestras, oficinas e apresentação de projetos dos cursos.",
            audience="institution",
            starts_at=at(today + timedelta(days=10), 19),
            ends_at=at(today + timedelta(days=12), 22),
            capacity=60,
        )
        self.publication(
            coordination,
            kind="event",
            title="Feira de Estágios",
            body="Empresas da região apresentam vagas de estágio.",
            audience="institution",
            starts_at=at(today + timedelta(days=21), 18),
            ends_at=at(today + timedelta(days=21), 22),
            publish_at=at(today + timedelta(days=3), 8),
        )
        self.add(
            Publication(
                creator_id=coordination.id,
                kind="event",
                title="Visita técnica — Cooperativa",
                body="Saída às 8h do pátio da unidade.",
                audience="institution",
                starts_at=at(today + timedelta(days=30), 8),
                ends_at=at(today + timedelta(days=30), 12),
                capacity=40,
                draft=True,
            )
        )
        for key in ["ana", "lucas", "julia"]:
            self.add(Enrollment(publication_id=semana.id, user_id=people[key].id))
        sent = now() - timedelta(hours=20)
        self.submission(
            lista,
            people["ana"],
            "Resolução completa com gráficos dos resíduos.",
            sent,
            9.0,
            "Boa análise dos resíduos. Revise a interpretação do R² no exercício 4.",
        )
        self.submission(lista, people["beatriz"], "Exercícios 1 a 6 resolvidos.", sent)
        self.submission(lista, people["diego"], "Rascunho dos exercícios 1 e 2.")
        self.submission(plano, people["julia"], "Plano para uma padaria do centro.", sent)
        self.submission(plano, people["lucas"], "Rascunho do público-alvo.")
        before = at(today - timedelta(days=4), 21)
        self.submission(
            caixa,
            people["lucas"],
            "Planilha com seis meses projetados.",
            before,
            7.5,
            "Projeção coerente; faltou o cenário pessimista.",
        )
        self.submission(
            caixa,
            people["mariana"],
            "Fluxo de caixa com três cenários.",
            before,
            8.0,
            "Ótima organização. Detalhe as premissas de vendas.",
        )


def seed(sessions, password):
    with sessions() as db:
        if db.scalar(select(Course.id)):
            raise ValueError("A base já possui cursos. Use seed-demo somente em base vazia.")
        actor = db.scalar(select(User).where(User.role == "coordinator", User.archived.is_(False)))
        if not actor:
            raise ValueError("Crie a coordenação com o comando bootstrap antes do seed-demo.")
        return Seeder(db, actor, password).run()
